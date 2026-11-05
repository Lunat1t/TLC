import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseConfig } from "@/utils/supabase/config";

export const createClient = () => {
  const { url, publishableKey } = getSupabaseConfig();
  return createBrowserClient(url, publishableKey);
};
