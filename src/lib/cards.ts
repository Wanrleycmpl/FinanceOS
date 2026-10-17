// Statement dates and status for credit cards. Same closing rule as public.statement_for in SQL.
const pad = (n: number) => String(n).padStart(2, "0");
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const ym = (month: string) => month.split("-").slice(0, 2).map(Number) as [number, number];
const addMonths = (y: number, m: number, k: number) => { const d = new Date(Date.UTC(y, m - 1 + k, 1)); return [d.getUTCFullYear(), d.getUTCMonth() + 1] as const; };

/** Statement (first day of the closing month) that a purchase on `date` belongs to. */
export function statementFor(date: string, closingDay: number): string {
  const [y, m] = ym(date);
  const close = `${y}-${pad(m)}-${pad(Math.min(closingDay, lastDay(y, m)))}`;
  const [ny, nm] = date < close ? [y, m] : addMonths(y, m, 1);
  return `${ny}-${pad(nm)}-01`;
}

/** Closing date of a statement month (clamped to the month's last day). */
export function closingDate(statementMonth: string, closingDay: number): string {
  const [y, m] = ym(statementMonth);
  return `${y}-${pad(m)}-${pad(Math.min(closingDay, lastDay(y, m)))}`;
}

/** Due date: same month when the due day is after the closing day; otherwise the next month. */
export function dueDate(statementMonth: string, closingDay: number, dueDay: number): string {
  const [y, m] = ym(statementMonth);
  const [dy, dm] = dueDay > closingDay ? [y, m] : addMonths(y, m, 1);
  return `${dy}-${pad(dm)}-${pad(Math.min(dueDay, lastDay(dy, dm)))}`;
}

export type StatementStatus = "open" | "closed" | "paid" | "partial" | "late" | "late_partial" | "credit";
export const STATEMENT_STATUS_LABEL: Record<StatementStatus, string> = {
  open: "Aberta",
  closed: "Fechada",
  paid: "Paga",
  partial: "Paga parcialmente",
  late: "Atrasada",
  late_partial: "Atrasada (parcial)",
  credit: "Com crédito",
};

export type StatementRow = {
  statement_month: string; purchases_cents: string; fees_cents: string; credits_cents: string; paid_cents: string; pending_payments_cents: string;
};

export function describeStatement(row: StatementRow, card: { closing_day: number; due_day: number }, today: string) {
  const purchases = BigInt(row.purchases_cents), fees = BigInt(row.fees_cents), credits = BigInt(row.credits_cents);
  const paid = BigInt(row.paid_cents), pendingPayments = BigInt(row.pending_payments_cents);
  const total = purchases + fees - credits;
  const remaining = total - paid;
  const close = closingDate(row.statement_month, card.closing_day);
  const due = dueDate(row.statement_month, card.closing_day, card.due_day);
  let status: StatementStatus;
  if (today < close) status = "open";
  else if (total < 0n || remaining < 0n) status = "credit";
  else if (remaining === 0n) status = "paid";
  else if (today > due) status = paid > 0n ? "late_partial" : "late";
  else status = paid > 0n ? "partial" : "closed";
  return { month: row.statement_month, close, due, purchases, fees, credits, total, paid, pendingPayments, remaining, status };
}
