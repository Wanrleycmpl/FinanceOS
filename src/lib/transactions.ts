// Pure helpers for the Transactions screen: labels, URL filters and month ranges.
// Shared by the list, the indicators and the CSV export so all use the same filters.
import { isValidDateOnly } from "@/lib/dates";

export type Nature = "income" | "expense" | "transfer" | "refund" | "financial";
export type Direction = "in" | "out";
export type Status = "pending" | "settled";

export const NATURE_LABEL: Record<Nature, string> = {
  income: "Receita",
  expense: "Despesa",
  transfer: "Transferência entre contas",
  refund: "Estorno / cashback",
  financial: "Movimentação financeira",
};
export const STATUS_LABEL: Record<Status, string> = { settled: "Liquidado", pending: "Pendente" };
export const PAGE_SIZE = 20;

export type Filters = {
  month: string; // YYYY-MM
  day: string | null; // YYYY-MM-DD inside month (clicked on the heatmap)
  account: string | null;
  category: string | null;
  nature: Nature | null;
  status: Status | null;
  q: string | null;
  showHidden: boolean;
  trash: boolean;
  page: number;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export function parseFilters(params: Params, today: string): Filters {
  const month = one(params.mes);
  const nature = one(params.natureza);
  const status = one(params.status);
  const page = Number.parseInt(one(params.pagina), 10);
  const day = isValidDateOnly(one(params.dia)) ? one(params.dia) : null;
  return {
    month: day ? day.slice(0, 7) : /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : today.slice(0, 7),
    day,
    account: UUID.test(one(params.conta)) ? one(params.conta) : null,
    category: UUID.test(one(params.categoria)) ? one(params.categoria) : null,
    nature: nature in NATURE_LABEL ? (nature as Nature) : null,
    status: status in STATUS_LABEL ? (status as Status) : null,
    q: one(params.busca).trim().slice(0, 80) || null,
    showHidden: one(params.ocultas) === "1",
    trash: one(params.lixeira) === "1",
    page: Number.isFinite(page) && page > 1 ? page : 1,
  };
}

/** Builds the query string for links, keeping the current filters (page resets unless given). */
export function filtersToQuery(f: Filters, override: Partial<Filters> = {}): string {
  const v = { ...f, page: 1, ...override };
  const p = new URLSearchParams();
  p.set("mes", v.month);
  if (v.day && v.day.startsWith(v.month)) p.set("dia", v.day);
  if (v.account) p.set("conta", v.account);
  if (v.category) p.set("categoria", v.category);
  if (v.nature) p.set("natureza", v.nature);
  if (v.status) p.set("status", v.status);
  if (v.q) p.set("busca", v.q);
  if (v.showHidden) p.set("ocultas", "1");
  if (v.trash) p.set("lixeira", "1");
  if (v.page > 1) p.set("pagina", String(v.page));
  return p.toString();
}

/** First and last day of a "YYYY-MM" month, as date-only strings. */
export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

/** The date range the filters select: one day (heatmap click) or the whole month. */
export function filterRange(f: Pick<Filters, "month" | "day">): { from: string; to: string } {
  return f.day ? { from: f.day, to: f.day } : monthRange(f.month);
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const name = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} de ${y}`;
}

/** Escapes % _ \ so a search for "100%" matches the literal text. */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, c => `\\${c}`);
}

/** Net figures from the database summary (all values exact cents). */
export function summarize(s: { income: string; expense: string; refunds: string; pending_income: string; pending_expense: string }) {
  const income = BigInt(s.income), expense = BigInt(s.expense), refunds = BigInt(s.refunds);
  const netExpense = expense - refunds;
  return { income, expense, refunds, netExpense, result: income - netExpense, pendingIncome: BigInt(s.pending_income), pendingExpense: BigInt(s.pending_expense) };
}

/** Database error codes raised by the triggers, in plain Portuguese. */
export function friendlyTransactionError(message: string | undefined): string {
  const map: Record<string, string> = {
    settled_in_future: "Lançamento com data futura precisa ficar como Pendente.",
    account_archived: "Essa conta está arquivada. Restaure-a em Contas para lançar nela.",
    before_opening_date: "A data é anterior ao saldo inicial da conta.",
    invalid_refund_origin: "O estorno precisa estar ligado a uma despesa ativa.",
    refund_before_purchase: "O estorno não pode ser anterior à compra.",
    refund_exceeds_purchase: "Os estornos somados passariam do valor da compra.",
    purchase_has_refunds: "Essa compra tem estornos. Mande os estornos para a lixeira antes, ou mantenha o valor acima deles.",
    category_archived: "Essa categoria está arquivada. Escolha outra ou restaure-a.",
    category_kind_mismatch: "Essa categoria não combina com o tipo do lançamento (ex.: categoria de receita numa despesa).",
  };
  const code = Object.keys(map).find(k => message?.includes(k));
  return code ? map[code] : "Não foi possível salvar o lançamento. Confira os campos e tente de novo.";
}
