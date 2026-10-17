"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { isValidDateOnly, todayInBrazil } from "@/lib/dates";
import { parseBRL } from "@/lib/money";
import type { ActionState } from "@/lib/utils";

const refreshAll = () => ["/assinaturas", "/visao-geral", "/transacoes", "/contas", "/cartoes", "/categorias"].forEach(p => revalidatePath(p));

const schema = z.object({
  id: z.union([z.uuid(), z.literal("")]),
  name: z.string().trim().min(2, "Informe o serviço (2 a 80 letras).").max(80),
  amount: z.string(),
  period: z.enum(["weekly", "monthly", "quarterly", "semiannual", "annual"], "Escolha a periodicidade."),
  next_charge_date: z.string().refine(isValidDateOnly, "Informe a data da próxima cobrança."),
  means: z.string().regex(/^(account|card):[0-9a-f-]{36}$/, "Escolha a conta ou o cartão da cobrança."),
  category_id: z.union([z.uuid(), z.literal("")]).transform(v => v || null),
});

export async function saveSubscription(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;
  const cents = parseBRL(v.amount);
  if (cents === null || cents <= 0n) return { error: "Valor inválido. Use o formato 39,90." };
  const [kind, id] = v.means.split(":");
  const fields = {
    name: v.name, amount_cents: cents.toString(), period: v.period,
    next_charge_date: v.next_charge_date, anchor_day: Number(v.next_charge_date.slice(8)), // billing day comes from the date
    account_id: kind === "account" ? id : null, card_id: kind === "card" ? id : null, category_id: v.category_id,
  };
  const { error } = v.id
    ? await supabase.from("personal_subscriptions").update(fields).eq("id", v.id).select("id").single()
    : await supabase.from("personal_subscriptions").insert(fields);
  if (error) return { error: "Não foi possível salvar a assinatura. Confira a conta/cartão e a categoria." };
  refreshAll();
  if (v.id) redirect("/assinaturas");
  return { ok: "Assinatura cadastrada. Nenhuma despesa foi criada: registre a cobrança quando ela acontecer." };
}

export async function setSubscriptionStatus(form: FormData) {
  const { supabase } = await requireUser();
  const id = z.uuid().safeParse(form.get("id"));
  const status = z.enum(["active", "paused", "cancelled"]).safeParse(form.get("status"));
  if (id.success && status.success) await supabase.from("personal_subscriptions").update({ status: status.data }).eq("id", id.data);
  refreshAll();
  redirect("/assinaturas");
}

/** Records the real charge: one expense linked to the subscription, and the next date moves forward. */
export async function registerCharge(form: FormData) {
  const { supabase } = await requireUser();
  const id = z.uuid().safeParse(form.get("id"));
  const date = String(form.get("date") ?? "");
  const cents = parseBRL(String(form.get("amount") ?? ""));
  if (!id.success || !isValidDateOnly(date) || cents === null || cents <= 0n) redirect("/assinaturas?erro=dados");
  if (date > todayInBrazil()) redirect("/assinaturas?erro=futura");
  const { error } = await supabase.rpc("register_subscription_charge", { p_subscription: id.data, p_date: date, p_amount_cents: cents.toString() });
  refreshAll();
  if (error) {
    const code = error.message.includes("before_opening_date") ? "abertura" : error.message.includes("archived") ? "arquivado" : error.message.includes("not_active") ? "inativa" : "falha";
    redirect(`/assinaturas?erro=${code}`);
  }
  redirect(`/assinaturas?ok=${id.data}`);
}
