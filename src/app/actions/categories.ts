"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import type { ActionState } from "@/lib/utils";

const name = z.string().trim().min(2, "O nome precisa ter de 2 a 60 letras.").max(60, "O nome precisa ter de 2 a 60 letras.");

function friendly(code: string | undefined) {
  if (code === "23505") return "Já existe uma categoria com esse nome neste nível.";
  return "Não foi possível salvar a categoria. Confira a categoria principal (ela não pode estar arquivada).";
}

export async function createCategory(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  const parsed = z.object({
    name,
    parent_id: z.union([z.uuid(), z.literal("")]),
    kind: z.enum(["expense", "income", "mixed"], "Escolha o tipo."),
  }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  // owner_id comes from auth.uid() in the database; a subcategory inherits the parent's kind there.
  const { error } = await supabase.from("categories").insert({
    name: parsed.data.name,
    parent_id: parsed.data.parent_id || null,
    kind: parsed.data.kind,
  });
  if (error) return { error: friendly(error.code) };
  revalidatePath("/categorias");
  return { ok: parsed.data.parent_id ? "Subcategoria criada." : "Categoria criada." };
}

export async function renameCategory(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  const parsed = z.object({ id: z.uuid(), name }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { data, error } = await supabase.from("categories").update({ name: parsed.data.name }).eq("id", parsed.data.id).select("id");
  if (error || !data?.length) return { error: friendly(error?.code) };
  revalidatePath("/categorias");
  redirect("/categorias");
}

export async function setCategoryArchived(form: FormData) {
  const { supabase } = await requireUser();
  const id = z.uuid().safeParse(form.get("id"));
  if (!id.success) return;
  const archive = form.get("archive") === "1";
  await supabase.from("categories").update({ archived_at: archive ? new Date().toISOString() : null }).eq("id", id.data);
  revalidatePath("/categorias");
}
