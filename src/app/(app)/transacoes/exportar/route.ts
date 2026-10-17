import type { NextRequest } from "next/server";
import { transactionsToCsv } from "@/lib/csv-export";
import { getAccounts, getCards, getCategories, listTransactions } from "@/lib/data";
import { todayInBrazil } from "@/lib/dates";
import { parseFilters } from "@/lib/transactions";

// Downloads the transactions of the current filters (same rules as the list), up to 5.000 rows.
export async function GET(request: NextRequest) {
  const f = parseFilters(Object.fromEntries(request.nextUrl.searchParams), todayInBrazil());
  const [accounts, categories, cards] = await Promise.all([getAccounts(), getCategories(), getCards()]);
  const rows = [];
  for (let page = 1; page <= 5; page++) {
    const batch = await listTransactions({ ...f, page }, categories, 1000);
    rows.push(...batch.rows);
    if (rows.length >= batch.total) break;
  }
  const acc = new Map(accounts.map(a => [a.id, `${a.institution_name} · ${a.name}`]));
  const card = new Map(cards.map(c => [c.id, `Cartão ${c.name}`]));
  const where = (t: { account_id: string | null; card_id: string | null; statement_month: string | null }) =>
    t.card_id && !t.account_id ? `${card.get(t.card_id) ?? "Cartão"} (fatura ${t.statement_month?.slice(5, 7)}/${t.statement_month?.slice(0, 4)})` : acc.get(t.account_id ?? "") ?? "";
  const cat = new Map(categories.map(c => [c.id, c]));
  const catName = (id: string | null) => {
    const c = id ? cat.get(id) : undefined;
    if (!c) return "";
    const p = c.parent_id ? cat.get(c.parent_id) : undefined;
    return p ? `${p.name} › ${c.name}` : c.name;
  };
  const csv = transactionsToCsv(rows.map(t => ({
    date: t.date, description: t.description, nature: t.nature, direction: t.direction, category: catName(t.category_id),
    account: where(t), toAccount: t.to_account_id ? acc.get(t.to_account_id) ?? "" : t.nature === "card_payment" && t.card_id ? card.get(t.card_id) ?? "" : "",
    amount_cents: t.amount_cents, status: t.status, hidden: t.hidden, excluded: t.excluded_from_reports,
  })));
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="financeos-transacoes-${f.month}${f.trash ? "-lixeira" : ""}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
