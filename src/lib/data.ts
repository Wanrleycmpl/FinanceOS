import "server-only";
import { requireUser } from "@/lib/auth";
import type { CategoryKind } from "@/lib/catalog";
import type { CategoryTotalRow, DayRow } from "@/lib/dashboard";
import { escapeLike, filterRange, monthRange, PAGE_SIZE, summarize, type Direction, type Filters, type Nature, type Status } from "@/lib/transactions";

export type AccountKind = "checking" | "savings" | "wallet" | "cash";
export const ACCOUNT_KIND_LABEL: Record<AccountKind, string> = {
  checking: "Conta corrente",
  savings: "Poupança",
  wallet: "Carteira digital",
  cash: "Dinheiro",
};

export type Account = {
  id: string;
  institution_id: string;
  institution_name: string;
  name: string;
  kind: AccountKind;
  opening_balance_cents: string; // exact cents as text
  opening_date: string;
  archived_at: string | null;
};

export type Category = {
  id: string;
  parent_id: string | null;
  name: string;
  kind: CategoryKind;
  template_key: string | null;
  sort_order: number;
  archived_at: string | null;
};

// Every read goes through requireUser(): the session is validated and RLS limits rows to the owner.
export async function getAccounts(): Promise<Account[]> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("accounts_read")
    .select("id, institution_id, institution_name, name, kind, opening_balance_cents, opening_date, archived_at")
    .order("institution_name")
    .order("name");
  if (error) throw new Error("Não foi possível carregar as contas. Confira se a migration foi aplicada.");
  return data as Account[];
}

export async function getCategories(): Promise<Category[]> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("categories")
    .select("id, parent_id, name, kind, template_key, sort_order, archived_at")
    .order("sort_order")
    .order("name")
    .limit(2000);
  if (error) throw new Error("Não foi possível carregar as categorias. Confira se a migration foi aplicada.");
  return data as Category[];
}

export type Transaction = {
  id: string;
  nature: Nature;
  direction: Direction;
  account_id: string;
  to_account_id: string | null;
  category_id: string | null;
  refund_of: string | null;
  description: string;
  amount_cents: string; // exact cents as text
  date: string;
  status: Status;
  hidden: boolean;
  excluded_from_reports: boolean;
  trashed_at: string | null;
  created_at: string;
};
const TX_COLUMNS = "id, nature, direction, account_id, to_account_id, category_id, refund_of, description, amount_cents, date, status, hidden, excluded_from_reports, trashed_at, created_at";

/** Current settled balance and pending total per account (exact cents as text). */
export async function getBalances(): Promise<Map<string, { balance: string; pending: string }>> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("account_balances");
  if (error) throw new Error("Não foi possível calcular os saldos. Confira se as migrations foram aplicadas.");
  return new Map((data as { account_id: string; balance_cents: string; pending_cents: string }[]).map(r => [r.account_id, { balance: r.balance_cents, pending: r.pending_cents }]));
}

/** Category plus its subcategories, so filtering by a parent includes the children. */
function categoryScope(categories: Category[], id: string): string[] {
  return [id, ...categories.filter(c => c.parent_id === id).map(c => c.id)];
}

export async function listTransactions(f: Filters, categories: Category[], pageSize = PAGE_SIZE) {
  const { supabase } = await requireUser();
  const { from, to } = filterRange(f);
  let q = supabase.from("transactions_read").select(TX_COLUMNS, { count: "exact" }).gte("date", from).lte("date", to);
  q = f.trash ? q.not("trashed_at", "is", null) : q.is("trashed_at", null);
  if (!f.showHidden && !f.trash) q = q.eq("hidden", false);
  if (f.account) q = q.or(`account_id.eq.${f.account},to_account_id.eq.${f.account}`);
  if (f.category) q = q.in("category_id", categoryScope(categories, f.category));
  if (f.nature) q = q.eq("nature", f.nature);
  if (f.status) q = q.eq("status", f.status);
  if (f.q) q = q.ilike("description", `%${escapeLike(f.q)}%`);
  const start = (f.page - 1) * pageSize;
  const { data, error, count } = await q.order("date", { ascending: false }).order("created_at", { ascending: false }).range(start, start + pageSize - 1);
  if (error) throw new Error("Não foi possível carregar as transações. Confira se as migrations foram aplicadas.");
  return { rows: data as Transaction[], total: count ?? 0 };
}

export async function getSummary(f: Pick<Filters, "month" | "day" | "account" | "category" | "nature" | "status" | "q">) {
  const { supabase } = await requireUser();
  const { from, to } = filterRange(f);
  const { data, error } = await supabase.rpc("transaction_summary", {
    p_from: from, p_to: to, p_account: f.account, p_category: f.category, p_nature: f.nature, p_status: f.status, p_search: f.q,
  });
  if (error) throw new Error("Não foi possível calcular os indicadores. Confira se as migrations foram aplicadas.");
  const raw = data as { income: string; expense: string; refunds: string; pending_income: string; pending_expense: string; operational_count: number };
  return { ...summarize(raw), operationalCount: raw.operational_count };
}

export async function getTransaction(id: string): Promise<Transaction | null> {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("transactions_read").select(TX_COLUMNS).eq("id", id).maybeSingle();
  return (data as Transaction | null) ?? null;
}

/** Net spending per day of a month, with "has records" and "covered by an imported statement". */
export async function getDailySpending(month: string, account: string | null): Promise<DayRow[]> {
  const { supabase } = await requireUser();
  const { from, to } = monthRange(month);
  const { data, error } = await supabase.rpc("daily_spending", { p_from: from, p_to: to, p_account: account });
  if (error) throw new Error("Não foi possível calcular o ritmo de gastos. Confira se a migration da Entrega 03 foi aplicada.");
  return data as DayRow[];
}

/** Totals per leaf category (income and net expense), same exclusions as the indicators. */
export async function getCategoryTotals(month: string, account: string | null): Promise<CategoryTotalRow[]> {
  const { supabase } = await requireUser();
  const { from, to } = monthRange(month);
  const { data, error } = await supabase.rpc("category_totals", { p_from: from, p_to: to, p_account: account });
  if (error) throw new Error("Não foi possível somar as categorias. Confira se a migration da Entrega 03 foi aplicada.");
  return data as CategoryTotalRow[];
}

/** Sum of active refunds linked to a purchase, in any month. */
export async function getRefundedTotal(purchaseId: string): Promise<bigint> {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("transactions_read").select("amount_cents").eq("refund_of", purchaseId).is("trashed_at", null);
  return (data ?? []).reduce((s, r) => s + BigInt((r as { amount_cents: string }).amount_cents), 0n);
}

export async function getProfile() {
  const { supabase, user } = await requireUser();
  const { data } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
  return { email: user.email ?? "", displayName: data?.display_name ?? "" };
}
