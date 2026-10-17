import { describe, expect, it } from "vitest";
import { annualCost, monthlyEquivalent, nextChargeDate, upcomingCharges, type SubscriptionRow } from "@/lib/subscriptions";

describe("equivalente mensal", () => {
  it("R$ 120,00 por ano equivale a R$ 10,00 por mês, com a conta explicada", () => {
    expect(monthlyEquivalent(12000n, "annual")).toEqual({ cents: 1000n, exact: true, formula: "R$ 120,00 por ano ÷ 12" });
    expect(monthlyEquivalent(3990n, "monthly")).toMatchObject({ cents: 3990n, formula: "já é mensal" });
    expect(monthlyEquivalent(10000n, "quarterly")).toMatchObject({ cents: 3333n, exact: false, formula: "R$ 100,00 × 4 por ano ÷ 12" });
    expect(monthlyEquivalent(1000n, "weekly")).toMatchObject({ cents: 4333n, formula: "R$ 10,00 × 52 por ano ÷ 12" });
    expect(annualCost(2990n, "semiannual")).toBe(5980n);
  });
});

describe("próxima cobrança", () => {
  it("segue a mesma regra do banco", () => {
    expect(nextChargeDate("2026-01-31", "monthly", 31)).toBe("2026-02-28");
    expect(nextChargeDate("2026-02-28", "monthly", 31)).toBe("2026-03-31");
    expect(nextChargeDate("2026-08-31", "semiannual", 31)).toBe("2027-02-28");
    expect(nextChargeDate("2026-12-29", "weekly", 29)).toBe("2027-01-05");
  });
  it("lista atrasadas e as dos próximos 30 dias, só ativas", () => {
    const sub = (id: string, date: string, status: SubscriptionRow["status"] = "active"): SubscriptionRow =>
      ({ id, name: id, amount_cents: "100", period: "monthly", anchor_day: 1, next_charge_date: date, account_id: "a", card_id: null, category_id: null, status });
    const list = upcomingCharges([sub("x", "2026-11-20"), sub("y", "2026-10-10"), sub("z", "2026-10-20", "paused"), sub("w", "2026-10-18")], "2026-10-17");
    expect(list.map(s => [s.id, s.overdue])).toEqual([["y", true], ["w", false]]);
  });
});
