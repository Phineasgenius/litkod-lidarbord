import { NextResponse } from 'next/server';
import { fetchLeetCodeStats } from '@/lib/leetcode';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    let { username, displayName, secretKey } = body;

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase is not configured on the server. Please check your environment variables.' }, { status: 500 });
    }

    // Verify secret passkey
    if (secretKey !== 'imalitkodar') {
      return NextResponse.json({ error: 'Access denied: Invalid secret passkey.' }, { status: 403 });
    }

    if (!username || typeof username !== 'string') {
      return NextResponse.json({ error: 'Username is required and must be a string' }, { status: 400 });
    }

    username = username.trim();
    if (!displayName || typeof displayName !== 'string') {
      displayName = username; // Fallback to username
    }
    displayName = displayName.trim();

    // 1. Check if user already exists in our database
    const { data: existingUser, error: checkError } = await supabaseAdmin
      .from('leetcode_users')
      .select('id')
      .eq('username', username)
      .maybeSingle();

    if (checkError) {
      console.error('Supabase select error:', checkError);
      return NextResponse.json({ error: 'Database check failed' }, { status: 500 });
    }

    if (existingUser) {
      return NextResponse.json({ error: `User "${username}" is already on the leaderboard.` }, { status: 409 });
    }

    // 2. Fetch data from LeetCode to validate and get current stats
    let stats;
    try {
      stats = await fetchLeetCodeStats(username);
    } catch (lcError: any) {
      console.error('LeetCode fetch error:', lcError);
      return NextResponse.json({ error: lcError.message || 'LeetCode username not found or API issue' }, { status: 404 });
    }

    // 3. Insert user into the Supabase database
    const { data: newUser, error: insertError } = await supabaseAdmin
      .from('leetcode_users')
      .insert([
        {
          username: stats.username, // canonical casing
          display_name: displayName,
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
        },
      ])
      .select()
      .single();

    if (insertError) {
      console.error('Supabase insert error:', insertError);
      return NextResponse.json({ error: 'Failed to save user to the database' }, { status: 500 });
    }

    // Insert user joined update
    try {
      await supabaseAdmin
        .from('leaderboard_updates')
        .insert([
          {
            username: newUser.username,
            display_name: newUser.display_name,
            avatar_url: newUser.avatar_url,
            description: `joined the leaderboard with a score of ${newUser.score}! 🎉`,
          },
        ]);
    } catch (updateErr) {
      console.warn('Could not insert join activity update:', updateErr);
    }

    return NextResponse.json({ success: true, user: newUser }, { status: 201 });
  } catch (error: any) {
    console.error('Unexpected error adding user:', error);
    return NextResponse.json({ error: 'An unexpected server error occurred' }, { status: 500 });
  }
}
