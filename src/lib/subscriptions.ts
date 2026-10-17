// Personal subscriptions: monthly equivalent (exact cents with the formula shown) and upcoming charges.
import { divRound } from "@/lib/dashboard";

export type Period = "weekly" | "monthly" | "quarterly" | "semiannual" | "annual";
export const PERIOD_LABEL: Record<Period, string> = { weekly: "semanal", monthly: "mensal", quarterly: "trimestral", semiannual: "semestral", annual: "anual" };
export const PER_YEAR: Record<Period, bigint> = { weekly: 52n, monthly: 12n, quarterly: 4n, semiannual: 2n, annual: 1n };

export type SubscriptionRow = {
  id: string; name: string; amount_cents: string; period: Period; anchor_day: number; next_charge_date: string;
  account_id: string | null; card_id: string | null; category_id: string | null; status: "active" | "paused" | "cancelled";
};

/** Cost per year, exact: amount × charges per year. */
export function annualCost(amountCents: bigint, period: Period): bigint {
  return amountCents * PER_YEAR[period];
}

/** Monthly equivalent = cost per year ÷ 12 (rounded to the cent) plus the formula in words. */
export function monthlyEquivalent(amountCents: bigint, period: Period): { cents: bigint; exact: boolean; formula: string } {
  const year = annualCost(amountCents, period);
  const cents = divRound(year, 12n);
  const brl = (c: bigint) => `R$ ${(c / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${(c % 100n).toString().padStart(2, "0")}`;
  const formula = period === "monthly" ? "já é mensal"
    : period === "annual" ? `${brl(amountCents)} por ano ÷ 12`
    : `${brl(amountCents)} × ${PER_YEAR[period]} por ano ÷ 12`;
  return { cents, exact: year % 12n === 0n, formula };
}

/** Same rule as public.subscription_next: keeps the billing day, using the last day in short months. */
export function nextChargeDate(date: string, period: Period, anchorDay: number): string {
  const [y, m, d] = date.split("-").map(Number);
  if (period === "weekly") {
    const t = new Date(Date.UTC(y, m - 1, d + 7));
    return t.toISOString().slice(0, 10);
  }
  const months = { monthly: 1, quarterly: 3, semiannual: 6, annual: 12 }[period];
  const first = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return `${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(anchorDay, last)).padStart(2, "0")}`;
}

/** Active subscriptions due up to `days` ahead, plus overdue ones (forecast passed without a registered charge). */
export function upcomingCharges(subs: SubscriptionRow[], today: string, days = 30) {
  const [y, m, d] = today.split("-").map(Number);
  const limit = new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
  return subs
    .filter(s => s.status === "active" && s.next_charge_date <= limit)
    .map(s => ({ ...s, overdue: s.next_charge_date < today }))
    .sort((a, b) => a.next_charge_date.localeCompare(b.next_charge_date));
}
