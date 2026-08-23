import { createClient } from '@supabase/supabase-js';

// Server-side client using the service role key (full access, used only in API routes)
export function supabaseServer() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
}
