"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import type { ActionState } from "@/lib/utils";

export async function updateProfile(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser();
  const parsed = z.string().trim().min(2, "Informe um nome de 2 a 60 letras.").max(60).safeParse(form.get("display_name"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { error } = await supabase.from("profiles").update({ display_name: parsed.data }).eq("id", user.id);
  if (error) return { error: "Não foi possível salvar o perfil." };
  revalidatePath("/", "layout");
  return { ok: "Perfil salvo." };
}
