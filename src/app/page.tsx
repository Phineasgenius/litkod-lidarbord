import { supabase } from '@/lib/supabase';
import LeaderboardClient from './LeaderboardClient';
import styles from './page.module.css';

// Revalidate this page on every request (dynamic rendering)
export const revalidate = 0;

export default async function Home() {
  let users = [];
  let dbError = null;

  try {
    if (supabase) {
      const { data, error } = await supabase
        .from('leetcode_users')
        .select('*')
        .order('score', { ascending: false });

      if (error) {
        dbError = error.message;
      } else {
        users = data || [];
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
      <LeaderboardClient initialUsers={users} />
    </main>
  );
}
