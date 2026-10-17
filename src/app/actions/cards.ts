"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { parseBRL } from "@/lib/money";
import type { ActionState } from "@/lib/utils";

const day = (label: string) => z.coerce.number().int().min(1, `${label}: escolha um dia de 1 a 31.`).max(31, `${label}: escolha um dia de 1 a 31.`);
const cardSchema = z.object({
  id: z.union([z.uuid(), z.literal("")]),
  institution: z.string().trim().min(2, "Informe o banco/emissor (2 a 80 letras).").max(80),
  name: z.string().trim().min(2, "Informe o nome do cartão (2 a 60 letras).").max(60),
  last4: z.string().trim().regex(/^(\d{4})?$/, "Os últimos dígitos são 4 números (ou deixe vazio)."),
  limit: z.string(),
  closing_day: day("Fechamento"),
  due_day: day("Vencimento"),
});

export async function saveCard(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  const parsed = cardSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;
  const limit = parseBRL(v.limit.trim() === "" ? "0" : v.limit);
  if (limit === null || limit < 0n) return { error: "Limite inválido. Use o formato 5.000,00." };
  const { error } = await supabase.rpc("save_card", {
    p_id: v.id || null, p_institution: v.institution, p_name: v.name, p_last4: v.last4,
    p_limit_cents: limit.toString(), p_closing_day: v.closing_day, p_due_day: v.due_day,
  });
  if (error) return { error: "Não foi possível salvar o cartão. Tente de novo." };
  revalidatePath("/cartoes");
  revalidatePath("/visao-geral");
  if (v.id) redirect(`/cartoes?cartao=${v.id}`);
  return { ok: "Cartão criado." };
}

export async function setCardArchived(form: FormData) {
  const { supabase } = await requireUser();
  const id = z.uuid().safeParse(form.get("id"));
  if (!id.success) return;
  await supabase.from("credit_cards").update({ archived_at: form.get("archive") === "1" ? new Date().toISOString() : null }).eq("id", id.data);
  revalidatePath("/cartoes");
  revalidatePath("/visao-geral");
}
