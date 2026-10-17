"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { isValidDateOnly } from "@/lib/dates";
import { parseBRL } from "@/lib/money";
import type { ActionState } from "@/lib/utils";

const refreshAll = () => ["/parcelamentos", "/transacoes", "/visao-geral", "/contas", "/cartoes", "/categorias"].forEach(p => revalidatePath(p));

const planSchema = z.object({
  description: z.string().trim().min(2, "Descreva a compra (2 a 120 letras).").max(120, "Descreva a compra (2 a 120 letras)."),
  total: z.string(),
  count: z.coerce.number().int().min(2, "Use de 2 a 72 parcelas.").max(72, "Use de 2 a 72 parcelas."),
  first_date: z.string().refine(isValidDateOnly, "Informe a data da 1ª parcela."),
  means: z.string().regex(/^(account|card):[0-9a-f-]{36}$/, "Escolha a conta ou o cartão."),
  category_id: z.union([z.uuid(), z.literal("")]).transform(v => v || null),
  paid_count: z.coerce.number().int().min(0).max(72).default(0),
});

function friendly(message: string) {
  const map: Record<string, string> = {
    settled_in_future: "Só dá para marcar como pagas parcelas com data até hoje.",
    invalid_paid_count: "Número de parcelas já pagas inválido (no cartão, o pagamento é pela fatura).",
    invalid_total: "O total precisa ter pelo menos 1 centavo por parcela.",
    card_archived: "Esse cartão está arquivado.",
    account_archived: "Essa conta está arquivada.",
    before_opening_date: "A 1ª parcela é anterior ao saldo inicial da conta.",
    category_archived: "Essa categoria está arquivada.",
    category_kind_mismatch: "Escolha uma categoria de despesa.",
    plan_already_cancelled: "Esse parcelamento já foi cancelado.",
  };
  const key = Object.keys(map).find(k => message.includes(k));
  return key ? map[key] : "Não foi possível salvar o parcelamento. Tente de novo.";
}

export async function createPlan(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  const parsed = planSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;
  const total = parseBRL(v.total);
  if (total === null || total < BigInt(v.count)) return { error: "Total inválido. Use o formato 1.234,56 (pelo menos 1 centavo por parcela)." };
  const [kind, id] = v.means.split(":");
  if (kind === "account" && v.paid_count > v.count) return { error: "Há mais parcelas pagas do que parcelas." };
  const { data, error } = await supabase.rpc("create_installment_plan", {
    p_description: v.description, p_total_cents: total.toString(), p_count: v.count, p_first_date: v.first_date,
    p_account: kind === "account" ? id : null, p_card: kind === "card" ? id : null, p_category: v.category_id,
    p_paid_count: kind === "account" ? v.paid_count : 0,
  });
  if (error) return { error: friendly(error.message) };
  refreshAll();
  redirect(`/parcelamentos?plano=${data as string}`);
}

/** Confirm (or undo) payment of an installment paid from an account. */
export async function setInstallmentPaid(form: FormData) {
  const { supabase } = await requireUser();
  const id = z.uuid().safeParse(form.get("id"));
  const plan = z.uuid().safeParse(form.get("plan"));
  if (!id.success || !plan.success) redirect("/parcelamentos");
  const paid = form.get("paid") === "1";
  const { error } = await supabase.from("transactions").update({ status: paid ? "settled" : "pending" }).eq("id", id.data).select("id").single();
  refreshAll();
  redirect(`/parcelamentos?plano=${plan.data}${error ? `&erro=${error.message.includes("settled_in_future") ? "futura" : "falha"}` : ""}`);
}

export async function cancelPlan(form: FormData) {
  const { supabase } = await requireUser();
  const plan = z.uuid().safeParse(form.get("plan"));
  if (!plan.success) redirect("/parcelamentos");
  const { error } = await supabase.rpc("cancel_installment_plan", { p_plan: plan.data, p_refund_charged: form.get("refund") === "1" });
  refreshAll();
  redirect(`/parcelamentos?plano=${plan.data}${error ? "&erro=falha" : ""}`);
}
