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
/** Only internal links back to the Transactions list are accepted. */
const backTo = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "");
  return /^\/transacoes(\?[\w=&%.+-]*)?$/.test(s) ? s : "/transacoes";
};

const schema = z.object({
  id: optionalUuid,
  nature: z.enum(["income", "expense", "transfer", "refund", "financial"], "Escolha o tipo do lançamento."),
  direction: z.enum(["in", "out"]).optional(),
  account_id: z.uuid("Escolha a conta."),
  to_account_id: optionalUuid,
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
  if (v.nature === "transfer" && (!v.to_account_id || v.to_account_id === v.account_id)) return { error: "Escolha uma conta de destino diferente da conta de origem." };
  if (v.nature === "refund" && !v.refund_of) return { error: "O estorno precisa estar ligado a uma despesa." };
  if (v.nature === "financial" && !v.direction) return { error: "Diga se o dinheiro entrou ou saiu da conta." };

  const direction = v.nature === "financial" ? v.direction! : v.nature === "income" || v.nature === "refund" ? "in" : "out";
  const fields = {
    direction,
    account_id: v.account_id,
    to_account_id: v.nature === "transfer" ? v.to_account_id : null,
    category_id: v.nature === "refund" ? null : v.category_id, // the database copies the purchase's category
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
  if (v.id || v.nature === "refund") redirect(backTo(form.get("back")));
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
