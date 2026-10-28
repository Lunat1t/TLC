import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://gayjaicglasjnhmjljzp.supabase.co";
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  "sb_publishable_jElhFzJVfqdz7fN87oU7rA_AdkP49Lw";

export const createClient = () =>
  createBrowserClient(
    supabaseUrl!,
    supabaseKey!
  );
