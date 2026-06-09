import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/** Privileged server-side client — never expose to the browser. */
export function createServerClient() {
  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}
