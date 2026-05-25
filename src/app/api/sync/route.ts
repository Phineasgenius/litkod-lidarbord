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
      .select('id, username, last_synced_at');

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
