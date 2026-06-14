import { supabase } from '@/lib/supabase';
import LeaderboardClient from './LeaderboardClient';
import styles from './page.module.css';

// Revalidate this page on every request (dynamic rendering)
export const revalidate = 0;

export default async function Home() {
  let users = [];
  let updates = [];
  let dbError = null;

  try {
    if (supabase) {
      // 1. Fetch user leaderboard stats
      const { data: userData, error: userError } = await supabase
        .from('leetcode_users')
        .select('*')
        .order('score', { ascending: false });

      if (userError) {
        dbError = userError.message;
      } else {
        users = userData || [];
      }

      // 2. Fetch recent updates (limit to latest 15, and filter to last 3 days)
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
      const { data: updateData, error: updateError } = await supabase
        .from('leaderboard_updates')
        .select('*')
        .gte('created_at', threeDaysAgo)
        .order('created_at', { ascending: false })
        .limit(15);

      // If the updates table doesn't exist yet, do not crash the site
      if (!updateError) {
        updates = updateData || [];
      } else {
        console.warn('Could not fetch leaderboard updates:', updateError.message);
      }
    } else {
      dbError = 'Database credentials are not configured in your .env.local file.';
    }
  } catch (e: any) {
    dbError = e.message || 'Unknown database connection error';
  }

  return (
    <main className={styles.container}>
      {dbError && (
        <div className={styles.dbErrorBanner}>
          ⚠️ <strong>Database Connection Alert:</strong> {dbError} (Please see SQL/setup instructions in the chat)
        </div>
      )}
      <LeaderboardClient initialUsers={users} initialUpdates={updates} />
    </main>
  );
}
