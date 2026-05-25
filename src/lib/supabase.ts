import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Public client for reading (can be used on client or server components)
// We initialize it only if keys are present to prevent build-time crashes.
export const supabase = (supabaseUrl && supabaseUrl !== 'your_supabase_project_url' && supabaseAnonKey && supabaseAnonKey !== 'your_supabase_anon_key')
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null as any;

// Admin client for server-side writing (bypasses RLS, must ONLY be used in server environments)
export const supabaseAdmin = (supabaseUrl && supabaseUrl !== 'your_supabase_project_url' && supabaseServiceKey && supabaseServiceKey !== 'your_supabase_service_role_key')
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      }
    })
  : supabase;

