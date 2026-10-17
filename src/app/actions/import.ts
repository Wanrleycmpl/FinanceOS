"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { duplicateKey, MAX_ROWS } from "@/lib/csv-import";
import { isValidDateOnly } from "@/lib/dates";
import { MAX_CENTS } from "@/lib/money";

const date = z.string().refine(isValidDateOnly);
const row = z.object({
  date,
  description: z.string().trim().min(2).max(140),
  amount_cents: z.string().regex(/^[1-9]\d{0,13}$/).refine(v => BigInt(v) <= MAX_CENTS),
  direction: z.enum(["in", "out"]),
  external_id: z.string().trim().min(1).max(120).nullable(),
});
const checkInput = z.object({
  account: z.uuid(),
  hash: z.string().regex(/^[0-9a-f]{64}$/),
  rows: z.array(row.extend({ index: z.number().int().min(0) })).max(MAX_ROWS),
});

export type RowFlag = "external_exists" | "possible_duplicate";
export type CheckResult = { error?: string; alreadyImported?: boolean; flags?: Record<number, RowFlag> };

/**
 * Compares the file with what is already saved in the account:
 * - same bank ID → already imported (blocked);
 * - same date, value, direction and description without that ID → possible duplicate (needs review:
 *   two equal purchases can be legitimate).
 */
export async function checkImport(input: z.input<typeof checkInput>): Promise<CheckResult> {
  const { supabase } = await requireUser();
  const parsed = checkInput.safeParse(input);
  if (!parsed.success) return { error: "Arquivo ou conta inválidos." };
  const { account, hash, rows } = parsed.data;

  const batch = await supabase.from("import_batches").select("id").eq("account_id", account).eq("file_hash", hash).maybeSingle();
  if (batch.error) return { error: "Não foi possível verificar o arquivo. Confira se a migration da Entrega 03 foi aplicada." };
  if (batch.data) return { alreadyImported: true, flags: {} };
  if (rows.length === 0) return { flags: {} };

  const dates = rows.map(r => r.date).sort();
  const { data, error } = await supabase.from("transactions_read")
    .select("date, description, amount_cents, direction, external_id, trashed_at")
    .or(`account_id.eq.${account},to_account_id.eq.${account}`)
    .gte("date", dates[0]).lte("date", dates[dates.length - 1])
    .limit(10000);
  if (error) return { error: "Não foi possível comparar com os lançamentos existentes." };

  const existing = data as { date: string; description: string; amount_cents: string; direction: "in" | "out"; external_id: string | null; trashed_at: string | null }[];
  const externalIds = new Set(existing.filter(e => e.external_id).map(e => e.external_id!));
  const keys = new Set(existing.filter(e => !e.trashed_at).map(duplicateKey));
  const flags: Record<number, RowFlag> = {};
  for (const r of rows) {
    if (r.external_id && externalIds.has(r.external_id)) flags[r.index] = "external_exists";
    else if (keys.has(duplicateKey(r))) flags[r.index] = "possible_duplicate";
  }
  return { flags };
}

const importInput = z.object({
  account: z.uuid(),
  fileName: z.string().trim().min(1).max(200),
  hash: z.string().regex(/^[0-9a-f]{64}$/),
  periodStart: date,
  periodEnd: date,
  rows: z.array(row).max(MAX_ROWS),
});

export async function importCsv(input: z.input<typeof importInput>): Promise<{ error?: string; imported?: number }> {
  const { supabase } = await requireUser();
  const parsed = importInput.safeParse(input);
  if (!parsed.success) return { error: "Há linhas inválidas no lote. Revise a prévia." };
  const v = parsed.data;
  const ids = v.rows.map(r => r.external_id).filter(Boolean);
  if (new Set(ids).size !== ids.length) return { error: "O arquivo tem o mesmo ID externo em duas linhas selecionadas. Desmarque uma delas." };
  // One database call = one transaction: everything is imported or nothing is.
  const { data, error } = await supabase.rpc("import_transactions", {
    p_account: v.account, p_file_name: v.fileName, p_file_hash: v.hash,
    p_period_start: v.periodStart, p_period_end: v.periodEnd, p_rows: v.rows,
  });
  if (error) {
    const m = error.message;
    if (m.includes("file_already_imported")) return { error: "Este arquivo já foi importado nesta conta. Nada foi gravado." };
    if (m.includes("transactions_external_idx") || m.includes("duplicate key")) return { error: "Algum ID externo já existe nesta conta (talvez na lixeira). Nada foi gravado." };
    if (m.includes("account_archived")) return { error: "A conta está arquivada. Nada foi gravado." };
    if (m.includes("before_opening_date")) return { error: "Há linhas com data anterior ao saldo inicial da conta. Ajuste a data do saldo inicial em Contas ou desmarque essas linhas. Nada foi gravado." };
    return { error: "A importação falhou e nada foi gravado. Tente de novo." };
  }
  revalidatePath("/transacoes");
  revalidatePath("/visao-geral");
  revalidatePath("/contas");
  revalidatePath("/categorias");
  return { imported: data as number };
}
