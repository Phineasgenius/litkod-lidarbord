import { NextResponse } from 'next/server';
import { fetchLeetCodeStats } from '@/lib/leetcode';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST() {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase is not configured on the server. Please check your environment variables.' }, { status: 500 });
    }

    // 1. Fetch all users from the leaderboard (this represents their status BEFORE the sync)
    const { data: oldUsers, error: fetchError } = await supabaseAdmin
      .from('leetcode_users')
      .select('*');

    if (fetchError) {
      console.error('Error fetching users for sync:', fetchError);
      return NextResponse.json({ error: 'Failed to fetch users from database' }, { status: 500 });
    }

    if (!oldUsers || oldUsers.length === 0) {
      return NextResponse.json({ success: true, message: 'No users to sync.', results: [] });
    }

    // Optional: Add global cooldown. If the most recently synced user was updated within the last 15 seconds, return early.
    const mostRecentSync = Math.max(...oldUsers.map((u: any) => new Date(u.last_synced_at).getTime()));
    const timeSinceLastSync = Date.now() - mostRecentSync;
    const COOLDOWN_MS = 15 * 1000; // 15 seconds cooldown

    if (timeSinceLastSync < COOLDOWN_MS) {
      return NextResponse.json(
        { 
          error: 'Please wait at least 15 seconds between sync operations.',
          retryAfterSeconds: Math.ceil((COOLDOWN_MS - timeSinceLastSync) / 1000)
        }, 
        { status: 429 }
      );
    }

    // Map to keep track of individual sync updates
    const updatesToInsertMap: { [username: string]: any[] } = {};

    // 2. Perform parallel synchronization
    const syncPromises = oldUsers.map(async (user: any) => {
      try {
        const stats = await fetchLeetCodeStats(user.username);
        
        const { error: updateError } = await supabaseAdmin
          .from('leetcode_users')
          .update({
            easy_solved: stats.easySolved,
            medium_solved: stats.mediumSolved,
            hard_solved: stats.hardSolved,
            total_solved: stats.totalSolved,
            contest_rating: stats.contestRating,
            contest_global_ranking: stats.contestGlobalRanking,
            contest_attended_count: stats.contestAttendedCount,
            score: stats.score,
            avatar_url: stats.avatarUrl,
            last_synced_at: new Date().toISOString(),
          })
          .eq('id', user.id);

        if (updateError) {
          throw updateError;
        }

        // Compare old vs new stats to find changes
        const solvedDiff = stats.totalSolved - (user.total_solved || 0);
        const newScore = stats.score;
        const oldScore = user.score || 0;
        const newRating = stats.contestRating;
        const oldRating = user.contest_rating || 0;

        const userUpdates = [];

        if (solvedDiff > 0 && user.total_solved > 0) {
          userUpdates.push({
            username: user.username,
            display_name: user.display_name,
            avatar_url: stats.avatarUrl,
            description: `solved ${solvedDiff} new question${solvedDiff > 1 ? 's' : ''}! 🚀 (${stats.easySolved}E / ${stats.mediumSolved}M / ${stats.hardSolved}H)`,
          });
        }

        // Score milestones (crossed 100, 250, 500, 750, 1000, etc.)
        const scoreMilestones = [100, 250, 500, 750, 1000, 1500, 2000];
        for (const m of scoreMilestones) {
          if (newScore >= m && oldScore < m && oldScore > 0) {
            userUpdates.push({
              username: user.username,
              display_name: user.display_name,
              avatar_url: stats.avatarUrl,
              description: `reached a score milestone of ${m} points! 🌟`,
            });
          }
        }

        // Rating peaks / milestones
        if (newRating > oldRating && oldRating > 0) {
          userUpdates.push({
            username: user.username,
            display_name: user.display_name,
            avatar_url: stats.avatarUrl,
            description: `reached a new peak contest rating of ${newRating}! 📈 (+${newRating - oldRating})`,
          });
        }

        if (userUpdates.length > 0) {
          updatesToInsertMap[user.username] = userUpdates;
        }

        return { username: user.username, status: 'success' };
      } catch (err: any) {
        console.error(`Failed to sync user "${user.username}":`, err);
        return { username: user.username, status: 'failed', error: err.message || 'Unknown error' };
      }
    });

    const results = await Promise.all(syncPromises);

    // 3. Refetch users to establish new rankings and detect takeovers
    const { data: newUsers, error: refetchError } = await supabaseAdmin
      .from('leetcode_users')
      .select('*');

    if (!refetchError && newUsers) {
      // Sort lists by score descending to get rankings
      const oldUsersSorted = [...oldUsers].sort((a: any, b: any) => b.score - a.score);
      const newUsersSorted = [...newUsers].sort((a: any, b: any) => b.score - a.score);

      for (let newIdx = 0; newIdx < newUsersSorted.length; newIdx++) {
        const newUserObj = newUsersSorted[newIdx];
        const oldIdx = oldUsersSorted.findIndex((u: any) => u.username === newUserObj.username);

        // If a user climbed in rank (index decreased)
        if (oldIdx !== -1 && newIdx < oldIdx) {
          const overtakenUser = oldUsersSorted[newIdx];
          if (overtakenUser && overtakenUser.username !== newUserObj.username) {
            const takeoverDescription = `just overtook ${overtakenUser.display_name} to claim rank ${newIdx + 1}! ⚔️`;
            
            // Use a separate key for takeover so it does NOT override the activity update
            const takeoverKey = `${newUserObj.username}:takeover`;
            updatesToInsertMap[takeoverKey] = [{
              username: newUserObj.username,
              display_name: newUserObj.display_name,
              avatar_url: newUserObj.avatar_url,
              description: takeoverDescription,
            }];
          }
        }
      }
    }

    // 4. Clean previous matching update type and insert new one per key
    const activeUpdateKeys = Object.keys(updatesToInsertMap);
    for (const key of activeUpdateKeys) {
      try {
        const isTakeover = key.endsWith(':takeover');
        const realUsername = isTakeover ? key.replace(':takeover', '') : key;
        const userPool = updatesToInsertMap[key];
        if (!userPool || userPool.length === 0) continue;

        const latestUpdate = userPool[userPool.length - 1];

        // Only delete the same "type" of notification to preserve the other type:
        // Takeover keys delete rows whose description contains '⚔️'
        // Activity keys delete rows whose description does NOT contain '⚔️'
        const existingRows = await supabaseAdmin
          .from('leaderboard_updates')
          .select('id, description')
          .eq('username', realUsername);

        if (!existingRows.error && existingRows.data) {
          const idsToDelete = existingRows.data
            .filter((row: any) => isTakeover 
              ? row.description.includes('⚔️') 
              : !row.description.includes('⚔️')
            )
            .map((row: any) => row.id);

          if (idsToDelete.length > 0) {
            await supabaseAdmin
              .from('leaderboard_updates')
              .delete()
              .in('id', idsToDelete);
          }
        }

        // Insert the latest update for this key
        await supabaseAdmin
          .from('leaderboard_updates')
          .insert([latestUpdate]);

      } catch (dbErr) {
        console.warn(`Could not update notifications for key ${key}:`, dbErr);
      }
    }

    // 5. Database Self-Cleaning: Delete all updates older than 3 days
    try {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
      await supabaseAdmin
        .from('leaderboard_updates')
        .delete()
        .lt('created_at', threeDaysAgo);
    } catch (cleanErr) {
      console.warn('Could not self-clean old updates:', cleanErr);
    }

    const successful = results.filter(r => r.status === 'success').length;
    const failed = results.filter(r => r.status === 'failed').length;

    return NextResponse.json({
      success: true,
      message: `Sync completed. Success: ${successful}, Failed: ${failed}`,
      results,
    });
  } catch (error: any) {
    console.error('Unexpected error in sync endpoint:', error);
    return NextResponse.json({ error: 'An unexpected server error occurred during sync' }, { status: 500 });
  }
}
