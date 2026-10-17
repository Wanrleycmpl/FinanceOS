import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Data access entry point: validates the session with the Auth server (getUser) and
 * returns a client whose queries run as that user under RLS. Never trust ids from the browser.
 */
export const requireUser = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect("/entrar");
  return { supabase, user: data.user };
});
