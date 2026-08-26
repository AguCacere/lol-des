import { createClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client (service role — bypasses RLS, never expose this
 * key to the browser). Use inside Route Handlers / Server Components only.
 */
export function getSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase env vars missing. Copy .env.example to .env.local and fill in NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from your Supabase project settings."
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}
