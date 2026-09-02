import {
  createClient as createSupabaseClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

const getSupabaseConfig = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Supabaseの環境変数が設定されていません。NEXT_PUBLIC_SUPABASE_URL と NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY を確認してください。"
    );
  }

  return { supabaseUrl, supabaseKey };
};

let browserSupabaseClient: SupabaseClient | undefined;

export function createBrowserSupabaseClient() {
  if (browserSupabaseClient) {
    return browserSupabaseClient;
  }

  const { supabaseUrl, supabaseKey } = getSupabaseConfig();

  browserSupabaseClient = createSupabaseClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return browserSupabaseClient;
}

export function createClient() {
  return createBrowserSupabaseClient();
}
