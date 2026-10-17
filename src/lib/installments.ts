// Progress of an installment plan from its installment rows. Exact cents (BigInt) throughout.
export type PlanRow = {
  id: string; description: string; total_cents: string; installments_count: number; first_date: string;
  account_id: string | null; card_id: string | null; category_id: string | null; cancelled_at: string | null;
};
export type InstallmentRow = {
  id: string; plan_id: string; installment_number: number; amount_cents: string; date: string;
  status: "pending" | "settled"; statement_month: string | null; trashed_at: string | null;
};

export type InstallmentState = "paid" | "due" | "upcoming" | "on_statement" | "future" | "cancelled";
export const INSTALLMENT_STATE_LABEL: Record<InstallmentState, string> = {
  paid: "Paga",
  due: "Vencida: confirme se pagou",
  upcoming: "A pagar",
  on_statement: "Na fatura",
  future: "Futura",
  cancelled: "Cancelada",
};

/**
 * Account installments: paid only when you confirm (date alone proves nothing).
 * Card installments: charged on their statement; paid when that statement is fully paid.
 */
export function installmentState(row: InstallmentRow, isCard: boolean, today: string, paidStatements: Set<string>): InstallmentState {
  if (row.trashed_at) return "cancelled";
  if (isCard) {
    if (row.date > today) return "future";
    return row.statement_month && paidStatements.has(row.statement_month) ? "paid" : "on_statement";
  }
  if (row.status === "settled") return "paid";
  return row.date <= today ? "due" : "upcoming";
}

export function summarizePlan(plan: PlanRow, rows: InstallmentRow[], refunded: bigint, today: string, paidStatements: Set<string>) {
  const isCard = Boolean(plan.card_id);
  const items = rows
    .filter(r => r.plan_id === plan.id)
    .sort((a, b) => a.installment_number - b.installment_number)
    .map(r => ({ ...r, cents: BigInt(r.amount_cents), state: installmentState(r, isCard, today, paidStatements) }));
  const active = items.filter(i => i.state !== "cancelled");
  const paid = active.filter(i => i.state === "paid");
  const sum = (xs: { cents: bigint }[]) => xs.reduce((s, x) => s + x.cents, 0n);
  const total = BigInt(plan.total_cents);
  const paidCents = sum(paid);
  const cancelledCents = sum(items.filter(i => i.state === "cancelled"));
  const remainingCents = sum(active) - paidCents;
  const next = active.find(i => i.state !== "paid");
  const status: "active" | "done" | "cancelled" = plan.cancelled_at ? "cancelled" : remainingCents === 0n ? "done" : "active";
  return {
    isCard, items, total, paidCents, remainingCents, cancelledCents, refunded,
    paidCount: paid.length, chargedCount: isCard ? active.filter(i => i.state !== "future").length : paid.length,
    count: plan.installments_count,
    progress: total > 0n ? Number((paidCents * 1000n) / total) / 10 : 0,
    next: next ? { number: next.installment_number, date: next.date, cents: next.cents, state: next.state } : null,
    dueCount: active.filter(i => i.state === "due").length,
    status,
  };
}
