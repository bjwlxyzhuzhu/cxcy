import { createBrowserClient } from "@supabase/ssr";

type RuntimeConfig = {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
};

declare global {
  interface Window {
    __CXCY_RUNTIME_CONFIG__?: RuntimeConfig;
  }
}

/** 浏览器端 Supabase 客户端（publishable key，受 RLS 约束） */
export function createClient() {
  const runtime = typeof window !== "undefined" ? window.__CXCY_RUNTIME_CONFIG__ : undefined;
  const url = runtime?.supabaseUrl || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = runtime?.supabaseAnonKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return createBrowserClient(
    url!,
    key!
  );
}
