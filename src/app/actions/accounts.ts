"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { isValidDateOnly, todayInBrazil } from "@/lib/dates";
import { parseBRL } from "@/lib/money";
import type { ActionState } from "@/lib/utils";

const accountSchema = z.object({
  id: z.union([z.uuid(), z.literal("")]),
  institution: z.string().trim().min(2, "Informe a instituição (2 a 80 letras).").max(80),
  name: z.string().trim().min(2, "Informe o nome da conta (2 a 60 letras).").max(60),
  kind: z.enum(["checking", "savings", "wallet", "cash"], "Escolha o tipo da conta."),
  balance: z.string(),
  opening_date: z.string().refine(isValidDateOnly, "Informe uma data válida."),
});

export async function saveAccount(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  const parsed = accountSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;
  const cents = parseBRL(v.balance.trim() === "" ? "0" : v.balance);
  if (cents === null) return { error: "Saldo inválido. Use o formato 1.234,56 (até 2 casas decimais)." };
  if (v.opening_date > todayInBrazil()) return { error: "A data do saldo inicial não pode estar no futuro." };

  const { error } = await supabase.rpc("save_account", {
    p_id: v.id || null,
    p_institution: v.institution,
    p_name: v.name,
    p_kind: v.kind,
    p_opening_balance_cents: cents.toString(), // bigint as text: exact
    p_opening_date: v.opening_date,
  });
  if (error) {
    if (error.message.includes("opening_date_after_transactions")) return { error: "Já existem lançamentos antes dessa data nesta conta. Escolha uma data igual ou anterior ao primeiro lançamento." };
    if (error.message.includes("opening_date_in_future")) return { error: "A data do saldo inicial não pode estar no futuro." };
    return { error: "Não foi possível salvar a conta. Tente de novo." };
  }
  revalidatePath("/contas");
  revalidatePath("/visao-geral");
  if (v.id) redirect("/contas");
  return { ok: "Conta criada." };
}

export async function setAccountArchived(form: FormData) {
  const { supabase } = await requireUser();
  const id = z.uuid().safeParse(form.get("id"));
  if (!id.success) return;
  const archive = form.get("archive") === "1";
  await supabase.from("accounts").update({ archived_at: archive ? new Date().toISOString() : null }).eq("id", id.data);
  revalidatePath("/contas");
  revalidatePath("/visao-geral");
}
