import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export function supabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return { url, key };
}

/** One client per request. Uses only the publishable key; the user comes from the session cookie. */
export async function createClient() {
  // Read cookies first: it marks the route as per-request (never prerendered at build time).
  const cookieStore = await cookies();
  const env = supabaseEnv();
  if (!env) throw new Error("Supabase não configurado: preencha .env.local (veja .env.example).");
  return createServerClient(env.url, env.key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        // Server Components cannot write cookies; the proxy refreshes the session instead.
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {}
      },
    },
  });
}
