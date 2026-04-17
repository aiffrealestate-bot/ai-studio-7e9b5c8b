import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error('Missing environment variable: NEXT_PUBLIC_SUPABASE_URL');
}
if (!supabaseAnonKey) {
  throw new Error('Missing environment variable: NEXT_PUBLIC_SUPABASE_ANON_KEY');
}

// Public client — uses anon key, subject to RLS
let _publicClient: SupabaseClient | null = null;
export function getSupabaseClient(): SupabaseClient {
  if (!_publicClient) {
    _publicClient = createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: { persistSession: false },
    });
  }
  return _publicClient;
}

// Service-role client — bypasses RLS, for server-only use
let _adminClient: SupabaseClient | null = null;
export function getSupabaseAdminClient(): SupabaseClient {
  if (!supabaseServiceRoleKey) {
    throw new Error('Missing environment variable: SUPABASE_SERVICE_ROLE_KEY');
  }
  if (!_adminClient) {
    _adminClient = createClient(supabaseUrl!, supabaseServiceRoleKey, {
      auth: { persistSession: false },
    });
  }
  return _adminClient;
}
