"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { isValidDateOnly, todayInBrazil } from "@/lib/dates";
import { parseBRL } from "@/lib/money";
import { friendlyTransactionError } from "@/lib/transactions";
import type { ActionState } from "@/lib/utils";

const optionalUuid = z.union([z.uuid(), z.literal("")]).transform(v => v || null);
/** Only internal links back to the Transactions or Cards screens are accepted. */
const backTo = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "");
  return /^\/(transacoes|cartoes)(\?[\w=&%.+-]*)?$/.test(s) ? s : "/transacoes";
};

const meansValue = z.union([z.string().regex(/^(account|card):[0-9a-f-]{36}$/), z.literal("")]).optional();
const monthValue = z.union([z.string().regex(/^d{4}-(0[1-9]|1[0-2])$/), z.literal("")]).optional();
const schema = z.object({
  id: optionalUuid,
  nature: z.enum(["income", "expense", "transfer", "refund", "financial", "card_payment"], "Escolha o tipo do lançamento."),
  direction: z.enum(["in", "out"]).optional(),
  means: meansValue, // expense/refund: "account:<id>" or "card:<id>"
  account_id: optionalUuid.optional(),
  to_account_id: optionalUuid.optional(),
  card_id: optionalUuid.optional(),
  statement_month: monthValue, // YYYY-MM; empty = automatic from the date and the card closing day
  category_id: optionalUuid,
  refund_of: optionalUuid,
  description: z.string().trim().min(2, "Descreva o lançamento (2 a 140 letras).").max(140, "Descreva o lançamento (2 a 140 letras)."),
  amount: z.string(),
  date: z.string().refine(isValidDateOnly, "Informe uma data válida."),
  status: z.enum(["settled", "pending"]),
});

export async function saveTransaction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;
  const cents = parseBRL(v.amount);
  if (cents === null || cents <= 0n) return { error: "Valor inválido. Use um valor positivo, como 1.234,56; o tipo define se entra ou sai." };
  if (v.status === "settled" && v.date > todayInBrazil()) return { error: "Lançamento com data futura precisa ficar como Pendente." };

  // Where the money moves: an account, a card, or (card payment) both.
  let accountId = v.account_id ?? null, cardId: string | null = null;
  if (v.nature === "expense" || v.nature === "refund") {
    if (!v.means) return { error: "Escolha a conta ou o cartão." };
    const [kind, id] = v.means.split(":");
    accountId = kind === "account" ? id : null;
    cardId = kind === "card" ? id : null;
  } else if (v.nature === "card_payment") {
    cardId = v.card_id ?? null;
    if (!cardId) return { error: "Escolha o cartão da fatura." };
    if (!v.statement_month) return { error: "Escolha qual fatura está sendo paga." };
  }
  if (!accountId && !cardId) return { error: "Escolha a conta." };
  if (v.nature === "card_payment" && !accountId) return { error: "Escolha a conta de onde saiu o pagamento." };
  if (v.nature === "transfer" && (!v.to_account_id || v.to_account_id === accountId)) return { error: "Escolha uma conta de destino diferente da conta de origem." };
  if (v.nature === "refund" && !v.refund_of) return { error: "O estorno precisa estar ligado a uma despesa." };
  if (v.nature === "financial" && !v.direction) return { error: "Diga se o dinheiro entrou ou saiu da conta." };

  const direction = v.nature === "financial" ? v.direction! : v.nature === "income" || v.nature === "refund" ? "in" : "out";
  const fields = {
    direction,
    account_id: accountId,
    to_account_id: v.nature === "transfer" ? v.to_account_id : null,
    card_id: cardId,
    statement_month: cardId && v.statement_month ? `${v.statement_month}-01` : null, // null = the database computes it
    category_id: v.nature === "refund" || v.nature === "card_payment" ? null : v.category_id, // refunds copy the purchase category
    description: v.description,
    amount_cents: cents.toString(), // bigint as text: exact
    date: v.date,
    status: v.status,
  };
  // Type (nature) and refund link never change on edit; RLS + triggers validate everything again.
  const { error } = v.id
    ? await supabase.from("transactions").update(fields).eq("id", v.id).select("id").single()
    : await supabase.from("transactions").insert({ ...fields, nature: v.nature, refund_of: v.nature === "refund" ? v.refund_of : null });
  if (error) return { error: friendlyTransactionError(error.message) };
  revalidatePath("/transacoes");
  revalidatePath("/visao-geral");
  revalidatePath("/contas");
  revalidatePath("/cartoes");
  if (v.id || v.nature === "refund" || v.nature === "card_payment") redirect(backTo(form.get("back")));
  return { ok: "Lançamento salvo." };
}

const FLAGS = { hidden: "hidden", excluded: "excluded_from_reports", trash: "trashed_at" } as const;

/** Hide/show in the list, exclude/include in reports, send to/restore from trash. */
export async function setTransactionFlag(form: FormData) {
  const { supabase } = await requireUser();
  const back = backTo(form.get("back"));
  const id = z.uuid().safeParse(form.get("id"));
  const flag = String(form.get("flag")) as keyof typeof FLAGS;
  if (!id.success || !(flag in FLAGS)) redirect(back);
  const on = form.get("value") === "1";
  const patch = flag === "trash" ? { trashed_at: on ? new Date().toISOString() : null } : { [FLAGS[flag]]: on };
  const { error } = await supabase.from("transactions").update(patch).eq("id", id.data).select("id").single();
  revalidatePath("/transacoes");
  revalidatePath("/visao-geral");
  revalidatePath("/contas");
  if (error) {
    const code = error.message.includes("purchase_has_refunds") ? "estornos" : "falha";
    redirect(`${back}${back.includes("?") ? "&" : "?"}erro=${code}`);
  }
  redirect(back);
}
