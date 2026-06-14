import { NextResponse } from 'next/server';
import { fetchLeetCodeStats } from '@/lib/leetcode';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST() {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase is not configured on the server. Please check your environment variables.' }, { status: 500 });
    }

    // 1. Fetch all users from the leaderboard
    const { data: users, error: fetchError } = await supabaseAdmin
      .from('leetcode_users')
      .select('*');

    if (fetchError) {
      console.error('Error fetching users for sync:', fetchError);
      return NextResponse.json({ error: 'Failed to fetch users from database' }, { status: 500 });
    }

    if (!users || users.length === 0) {
      return NextResponse.json({ success: true, message: 'No users to sync.', results: [] });
    }

    // Optional: Add global cooldown. If the most recently synced user was updated within the last 15 seconds, return early.
    const mostRecentSync = Math.max(...users.map((u: any) => new Date(u.last_synced_at).getTime()));
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

    // 2. Perform parallel synchronization
    const syncPromises = users.map(async (user: any) => {
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

        // Generate updates / milestone events
        try {
          const solvedDiff = stats.totalSolved - (user.total_solved || 0);
          const newScore = stats.score;
          const oldScore = user.score || 0;
          const newRating = stats.contestRating;
          const oldRating = user.contest_rating || 0;

          const updatesToInsert = [];

          if (solvedDiff > 0 && user.total_solved > 0) {
            // Only log if they solved something new, and it's not the initial import (total_solved > 0)
            updatesToInsert.push({
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
              updatesToInsert.push({
                username: user.username,
                display_name: user.display_name,
                avatar_url: stats.avatarUrl,
                description: `reached a score milestone of ${m} points! 🌟`,
              });
            }
          }

          // Rating peaks / milestones
          if (newRating > oldRating && oldRating > 0) {
            updatesToInsert.push({
              username: user.username,
              display_name: user.display_name,
              avatar_url: stats.avatarUrl,
              description: `reached a new peak contest rating of ${newRating}! 📈 (+${newRating - oldRating})`,
            });
          }

          if (updatesToInsert.length > 0) {
            await supabaseAdmin
              .from('leaderboard_updates')
              .insert(updatesToInsert);
          }
        } catch (updateErr) {
          console.warn(`Could not log sync activities for ${user.username}:`, updateErr);
        }

        return { username: user.username, status: 'success' };
      } catch (err: any) {
        console.error(`Failed to sync user "${user.username}":`, err);
        return { username: user.username, status: 'failed', error: err.message || 'Unknown error' };
      }
    });

    const results = await Promise.all(syncPromises);
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
