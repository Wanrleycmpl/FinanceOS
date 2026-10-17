import { describe, expect, it } from "vitest";
import { closingDate, describeStatement, dueDate, statementFor } from "@/lib/cards";

const row = (p: string, paid = "0", extra: Partial<Record<string, string>> = {}) => ({
  statement_month: "2026-03-01", purchases_cents: p, fees_cents: "0", credits_cents: "0", paid_cents: paid, pending_payments_cents: "0", ...extra,
});
const card = { closing_day: 10, due_day: 20 };

describe("datas da fatura", () => {
  it("segue a mesma regra do banco de dados", () => {
    expect(statementFor("2026-03-09", 10)).toBe("2026-03-01");
    expect(statementFor("2026-03-10", 10)).toBe("2026-04-01");
    expect(statementFor("2026-02-28", 31)).toBe("2026-03-01");
    expect(statementFor("2026-12-15", 10)).toBe("2027-01-01");
  });
  it("fechamento e vencimento, com vencimento no mês seguinte quando o dia é menor", () => {
    expect(closingDate("2026-02-01", 31)).toBe("2026-02-28");
    expect(dueDate("2026-03-01", 10, 20)).toBe("2026-03-20");
    expect(dueDate("2026-03-01", 25, 5)).toBe("2026-04-05");
    expect(dueDate("2026-12-01", 28, 31)).toBe("2026-12-31");
    expect(dueDate("2026-01-01", 30, 31)).toBe("2026-01-31");
  });
});

describe("situação da fatura", () => {
  it("aberta, fechada, paga, parcial, atrasada e com crédito", () => {
    expect(describeStatement(row("10000"), card, "2026-03-09").status).toBe("open");
    expect(describeStatement(row("10000"), card, "2026-03-15").status).toBe("closed");
    expect(describeStatement(row("10000", "4000"), card, "2026-03-15")).toMatchObject({ status: "partial", remaining: 6000n });
    expect(describeStatement(row("10000", "10000"), card, "2026-03-25").status).toBe("paid");
    expect(describeStatement(row("10000"), card, "2026-03-21").status).toBe("late");
    expect(describeStatement(row("10000", "1"), card, "2026-03-21").status).toBe("late_partial");
    expect(describeStatement(row("1000", "0", { credits_cents: "3000" }), card, "2026-03-15")).toMatchObject({ status: "credit", total: -2000n });
    expect(describeStatement(row("10000", "0", { fees_cents: "1234", credits_cents: "234" }), card, "2026-03-15").total).toBe(11000n);
  });
});
