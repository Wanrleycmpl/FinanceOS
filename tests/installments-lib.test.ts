import { describe, expect, it } from "vitest";
import { installmentState, summarizePlan, type InstallmentRow, type PlanRow } from "@/lib/installments";
import { splitCents } from "@/lib/money";

const plan = (extra: Partial<PlanRow> = {}): PlanRow => ({ id: "p", description: "TV", total_cents: "10000", installments_count: 3, first_date: "2026-01-10", account_id: "a", card_id: null, category_id: null, cancelled_at: null, ...extra });
const rows = (statuses: ("pending" | "settled")[], dates = ["2026-01-10", "2026-02-10", "2026-03-10"], months = ["2026-01-01", "2026-02-01", "2026-03-01"]): InstallmentRow[] =>
  splitCents(10000n, 3).map((c, i) => ({ id: `r${i}`, plan_id: "p", installment_number: i + 1, amount_cents: c.toString(), date: dates[i], status: statuses[i], statement_month: months[i], trashed_at: null }));

describe("parcelas", () => {
  it("na conta: só confirmação conta como paga; data passada vira 'vencida: confirme'", () => {
    const s = summarizePlan(plan(), rows(["settled", "pending", "pending"]), 0n, "2026-02-15", new Set());
    expect(s.items.map(i => i.state)).toEqual(["paid", "due", "upcoming"]);
    expect([s.paidCents, s.remainingCents, s.paidCount, s.dueCount, s.progress]).toEqual([3334n, 6666n, 1, 1, 33.3]);
    expect(s.next).toMatchObject({ number: 2, state: "due" });
  });

  it("no cartão: paga quando a fatura da parcela está paga; futura enquanto não chega", () => {
    const r = rows(["settled", "settled", "settled"]);
    const s = summarizePlan(plan({ account_id: null, card_id: "c" }), r, 0n, "2026-02-15", new Set(["2026-01-01"]));
    expect(s.items.map(i => i.state)).toEqual(["paid", "on_statement", "future"]);
    expect(s.chargedCount).toBe(2);
    expect(installmentState(r[1], true, "2026-02-15", new Set(["2026-02-01"]))).toBe("paid");
  });

  it("cancelado: canceladas saem do restante; quitado quando nada falta", () => {
    const r = rows(["settled", "pending", "pending"]);
    r[1].trashed_at = r[2].trashed_at = "2026-02-01T00:00:00Z";
    const s = summarizePlan(plan({ cancelled_at: "2026-02-01T00:00:00Z" }), r, 0n, "2026-02-15", new Set());
    expect([s.status, s.remainingCents, s.cancelledCents]).toEqual(["cancelled", 0n, 6666n]);
    const done = summarizePlan(plan(), rows(["settled", "settled", "settled"], ["2026-01-10", "2026-01-10", "2026-01-10"]), 0n, "2026-02-15", new Set());
    expect([done.status, done.progress]).toEqual(["done", 100]);
  });
});
