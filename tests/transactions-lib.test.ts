import { describe, expect, it } from "vitest";
import { escapeLike, filtersToQuery, friendlyTransactionError, monthLabel, monthRange, parseFilters, shiftMonth, summarize } from "@/lib/transactions";

const ID = "3f2b8c1e-1d2a-4b5c-9e8f-0a1b2c3d4e5f";

describe("filtros de transações", () => {
  it("lê os filtros da URL e ignora valores inválidos", () => {
    const f = parseFilters({ mes: "2026-13", conta: "x", categoria: ID, natureza: "hack", status: "pending", busca: "  café ", pagina: "-3", ocultas: "1" }, "2026-10-17");
    expect(f).toEqual({ month: "2026-10", day: null, account: null, category: ID, nature: null, status: "pending", q: "café", showHidden: true, trash: false, page: 1 });
  });
  it("dia válido define o mês e entra nos links", () => {
    const f = parseFilters({ mes: "2026-01", dia: "2026-03-15" }, "2026-10-17");
    expect([f.month, f.day]).toEqual(["2026-03", "2026-03-15"]);
    expect(filtersToQuery(f)).toBe("mes=2026-03&dia=2026-03-15");
    expect(filtersToQuery(f, { month: "2026-04" })).toBe("mes=2026-04");
    expect(parseFilters({ dia: "2026-02-30" }, "2026-10-17").day).toBeNull();
  });
  it("monta links mantendo os filtros e voltando para a página 1", () => {
    const f = parseFilters({ mes: "2026-03", natureza: "expense", pagina: "4" }, "2026-10-17");
    expect(filtersToQuery(f)).toBe("mes=2026-03&natureza=expense");
    expect(filtersToQuery(f, { page: 2 })).toBe("mes=2026-03&natureza=expense&pagina=2");
  });
  it("calcula o intervalo do mês, inclusive fevereiro bissexto", () => {
    expect(monthRange("2028-02")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(monthRange("2026-12")).toEqual({ from: "2026-12-01", to: "2026-12-31" });
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(monthLabel("2026-03")).toBe("Março de 2026");
  });
  it("escapa curingas da busca", () => {
    expect(escapeLike("100%_a\\b")).toBe("100\\%\\_a\\\\b");
  });
});

describe("indicadores", () => {
  it("estorno reduz a despesa e não vira receita; resultado exato", () => {
    const s = summarize({ income: "500000", expense: "12345", refunds: "2345", pending_income: "0", pending_expense: "9900" });
    expect([s.netExpense, s.result, s.income]).toEqual([10000n, 490000n, 500000n]);
  });
  it("traduz erros do banco", () => {
    expect(friendlyTransactionError('new row violates: refund_exceeds_purchase')).toMatch(/passariam do valor/);
    expect(friendlyTransactionError(undefined)).toMatch(/Não foi possível/);
  });
});
