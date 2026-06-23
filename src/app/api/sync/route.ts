import { NextResponse } from 'next/server';
import { fetchLeetCodeStats } from '@/lib/leetcode';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase is not configured on the server. Please check your environment variables.' }, { status: 500 });
    }

    // 1. Fetch all users BEFORE sync (used as the "old" snapshot for comparison)
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

    // Parse if this is a manual override / forced sync
    const { searchParams } = new URL(request.url);
    const force = searchParams.get('force') === 'true';
    const cron = searchParams.get('cron') === 'true';

    // Global cooldown: skip if synced within cooldown period
    // 25 minutes for automated sync, 15 seconds for forced manual override sync
    const mostRecentSync = Math.max(...oldUsers.map((u: any) => new Date(u.last_synced_at).getTime()));
    const timeSinceLastSync = Date.now() - mostRecentSync;
    const COOLDOWN_MS = cron
    ? 0
    : force
    ? 15 * 1000
    : 25 * 60 * 1000;

    if (timeSinceLastSync < COOLDOWN_MS) {
      return NextResponse.json(
        {
          error: `Please wait at least ${force ? '15 seconds' : '25 minutes'} between sync operations.`,
          retryAfterSeconds: Math.ceil((COOLDOWN_MS - timeSinceLastSync) / 1000),
        },
        { status: 429 }
      );
    }

    // Build old Score rank map BEFORE syncing (username -> 1-based rank)
    const oldSortedByScore = [...oldUsers].sort((a: any, b: any) => (b.score || 0) - (a.score || 0));
    const oldRankMap: { [username: string]: number } = {};
    oldSortedByScore.forEach((u: any, idx: number) => {
      oldRankMap[u.username] = idx + 1;
    });

    // Map to accumulate notifications; keys:
    //   username          -> activity notification (solved, milestone, rating)
    //   username:takeover -> rank overtake notification (Score leaderboard only)
    const updatesToInsertMap: { [key: string]: any[] } = {};

    // 2. Parallel sync: fetch fresh LeetCode stats and update DB
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

        if (updateError) throw updateError;

        // --- Activity notifications ---
        const solvedDiff = stats.totalSolved - (user.total_solved || 0);
        const newScore = stats.score;
        const oldScore = user.score || 0;
        const newRating = stats.contestRating;
        const oldRating = user.contest_rating || 0;

        const userUpdates: any[] = [];

        // Problems solved
        if (solvedDiff > 0 && user.total_solved > 0) {
          userUpdates.push({
            username: user.username,
            display_name: user.display_name,
            avatar_url: stats.avatarUrl,
            description: `solved ${solvedDiff} new question${solvedDiff > 1 ? 's' : ''}! 🚀 (${stats.easySolved}E / ${stats.mediumSolved}M / ${stats.hardSolved}H)`,
          });
        }

        // Score milestones
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

        // Contest rating peak
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

    // 3. Refetch updated users to get new scores for rank comparison
    const { data: newUsers, error: refetchError } = await supabaseAdmin
      .from('leetcode_users')
      .select('*');

    if (!refetchError && newUsers) {
      // Build new Score rank map AFTER syncing (username -> 1-based rank)
      const newSortedByScore = [...newUsers].sort((a: any, b: any) => (b.score || 0) - (a.score || 0));
      const newRankMap: { [username: string]: number } = {};
      newSortedByScore.forEach((u: any, idx: number) => {
        newRankMap[u.username] = idx + 1;
      });

      // Detect rank improvements on the Score leaderboard
      for (const newUserObj of newSortedByScore) {
        const oldRank = oldRankMap[newUserObj.username];
        const newRank = newRankMap[newUserObj.username];

        // Only trigger if user actually moved UP in rank (lower rank number = better)
        if (oldRank !== undefined && newRank < oldRank) {
          const gained = oldRank - newRank;

          // Who held the new rank position BEFORE this sync?
          // oldSortedByScore[newRank - 1] is the user who was at that slot before
          const displacedUser = oldSortedByScore[newRank - 1];
          const displacedName =
            displacedUser && displacedUser.username !== newUserObj.username
              ? displacedUser.display_name
              : null;

          let description: string;
          if (gained === 1 && displacedName) {
            description = `overtook ${displacedName} to reach rank ${newRank} on the leaderboard! ⚔️`;
          } else if (displacedName) {
            description = `jumped ${gained} rank${gained > 1 ? 's' : ''} to rank ${newRank}, passing ${displacedName}! ⚔️`;
          } else {
            description = `climbed ${gained} rank${gained > 1 ? 's' : ''} up to rank ${newRank} on the leaderboard! ⚔️`;
          }

          // Use a separate key so takeover never overwrites the activity notification
          updatesToInsertMap[`${newUserObj.username}:takeover`] = [{
            username:     newUserObj.username,
            display_name: newUserObj.display_name,
            avatar_url:   newUserObj.avatar_url,
            description,
          }];
        }
      }
    }

    const insertedUpdates: any[] = [];

    // 4. Persist notifications — each key type only replaces its own kind
    //    Activity key  (plain username)    -> deletes old non-⚔️ rows, inserts latest
    //    Takeover key  (username:takeover) -> deletes old ⚔️ rows, inserts latest
    for (const key of Object.keys(updatesToInsertMap)) {
      try {
        const isTakeover = key.endsWith(':takeover');
        const realUsername = isTakeover ? key.slice(0, -(':takeover'.length)) : key;
        const pool = updatesToInsertMap[key];
        if (!pool || pool.length === 0) continue;

        const latestUpdate = pool[pool.length - 1];

        // Fetch existing rows for this user
        const { data: existingRows, error: fetchExistingErr } = await supabaseAdmin
          .from('leaderboard_updates')
          .select('id, description')
          .eq('username', realUsername);

        if (!fetchExistingErr && existingRows) {
          const idsToDelete = existingRows
            .filter((row: any) =>
              isTakeover
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

        const { data: insertedRows, error: insertError } = await supabaseAdmin
          .from('leaderboard_updates')
          .insert([latestUpdate])
          .select('*');

        if (insertError) {
          throw insertError;
        }

        if (insertedRows && insertedRows.length > 0) {
          insertedUpdates.push(insertedRows[0]);
        }
      } catch (dbErr) {
        console.warn(`Could not persist notification for key "${key}":`, dbErr);
      }
    }

    // 5. Self-clean: remove all updates older than 3 days
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
      activityUpdates: insertedUpdates,
    });
  } catch (error: any) {
    console.error('Unexpected error in sync endpoint:', error);
    return NextResponse.json({ error: 'An unexpected server error occurred during sync' }, { status: 500 });
  }
}
