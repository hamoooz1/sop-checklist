// src/lib/supabase.js
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || SUPABASE_URL.includes("your-supabase-url")) {
  throw new Error(
    "Supabase URL not set. Put VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local"
  );
}
if (!SUPABASE_ANON_KEY) {
  throw new Error("Supabase anon key not set. See .env.local");
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});
