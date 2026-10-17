"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient, supabaseEnv } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { loginToEmail } from "@/lib/login";
import type { ActionState } from "@/lib/utils";

export async function signIn(_: ActionState, form: FormData): Promise<ActionState> {
  if (!supabaseEnv()) return { error: "O Supabase ainda não foi configurado neste computador (.env.local)." };
  const email = loginToEmail(String(form.get("login") ?? ""));
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: "Informe usuário e senha." };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.code === "invalid_credentials") return { error: "Usuário ou senha incorretos." };
    if (error.code === "email_not_confirmed") return { error: "Este usuário não está confirmado. No Supabase, crie-o com “Auto Confirm User” ligado." };
    return { error: "Não foi possível entrar agora. Tente de novo em instantes." };
  }
  redirect("/visao-geral");
}

export async function updatePassword(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  const parsed = z.object({
    password: z.string().min(6, "A senha precisa ter pelo menos 6 caracteres.").max(72, "Use no máximo 72 caracteres."),
    confirm: z.string(),
  }).refine(v => v.password === v.confirm, { message: "As senhas não conferem." }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: error.code === "same_password" ? "Use uma senha diferente da atual." : "Não foi possível trocar a senha agora." };
  return { ok: "Senha alterada." };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/entrar");
}
