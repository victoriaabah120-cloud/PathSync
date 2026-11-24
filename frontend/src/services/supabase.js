import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

// False until frontend/.env is filled in. The app shows a setup message instead of crashing.
export const supabaseReady = Boolean(url && key);

export const supabase = createClient(url || "http://localhost", key || "missing-key");
