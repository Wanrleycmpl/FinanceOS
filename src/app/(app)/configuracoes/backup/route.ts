import { requireUser } from "@/lib/auth";
import { todayInBrazil } from "@/lib/dates";

// Full copy of the signed-in user's data as JSON (RLS limits every query to the owner).
// Money stays as exact cents in text. This is a safety copy for you to keep; restoring it
// into the app is not automated yet.
const TABLES: [name: string, from: string, columns: string][] = [
  ["perfil", "profiles", "display_name, created_at"],
  ["instituicoes", "institutions", "id, name, created_at"],
  ["contas", "accounts_read", "*"],
  ["categorias", "categories", "id, parent_id, name, kind, template_key, sort_order, archived_at, created_at"],
  ["cartoes", "credit_cards", "id, institution_id, name, last4, limit_cents::text, closing_day, due_day, archived_at, created_at"],
  ["parcelamentos", "installment_plans", "id, description, total_cents::text, installments_count, first_date, account_id, card_id, category_id, cancelled_at, created_at"],
  ["assinaturas", "personal_subscriptions", "id, name, amount_cents::text, period, anchor_day, next_charge_date, account_id, card_id, category_id, status, created_at"],
  ["importacoes", "import_batches", "id, account_id, file_name, file_hash, period_start, period_end, row_count, created_at"],
  ["lancamentos", "transactions_read", "*"],
];

export async function GET() {
  const { supabase, user } = await requireUser();
  const data: Record<string, unknown> = {};
  const problems: string[] = [];
  for (const [name, from, columns] of TABLES) {
    const rows: unknown[] = [];
    for (let start = 0; start < 50_000; start += 1000) {
      const { data: page, error } = await supabase.from(from).select(columns).order("created_at", { ascending: true }).range(start, start + 999);
      if (error) { problems.push(`${name}: não foi possível ler (${error.code ?? "erro"})`); break; }
      rows.push(...(page ?? []));
      if (!page || page.length < 1000) break;
    }
    data[name] = rows;
  }
  const body = {
    app: "FinanceOS",
    formato: 1,
    gerado_em: new Date().toISOString(),
    usuario: user.email,
    observacao: "Valores em centavos (texto). Datas financeiras no formato AAAA-MM-DD (calendário de Brasília).",
    problemas: problems,
    dados: data,
  };
  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="financeos-backup-${todayInBrazil()}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
}
