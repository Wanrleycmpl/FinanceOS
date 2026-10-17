import { describe, expect, it } from "vitest";
import { buildHeatmap, buildPace, divRound, elapsedDays, rankCategories, summarizePace, type DayRow } from "@/lib/dashboard";

const days = (month: string, n: number, data: Record<number, [string, boolean, boolean]> = {}): DayRow[] =>
  Array.from({ length: n }, (_, i) => {
    const [cents, rec, cov] = data[i + 1] ?? ["0", false, false];
    return { day: `${month}-${String(i + 1).padStart(2, "0")}`, expense_cents: cents, has_records: rec, covered: cov };
  });

describe("ritmo de gastos", () => {
  it("conta dias decorridos e acumula só até hoje", () => {
    expect(elapsedDays("2026-10", "2026-10-17")).toBe(17);
    expect(elapsedDays("2026-09", "2026-10-17")).toBe(30);
    expect(elapsedDays("2026-11", "2026-10-17")).toBe(0);
    const pace = buildPace(days("2026-10", 31, { 1: ["1000", true, false], 3: ["500", true, false], 20: ["9", true, false] }), days("2026-09", 30, { 2: ["700", true, false] }), "2026-10", "2026-10-03");
    expect(pace.slice(0, 4).map(p => [p.daily, p.cumulative, p.previous])).toEqual([["1000", "1000", "0"], ["0", "1000", "700"], ["500", "1500", "700"], [null, null, "700"]]);
    expect(pace[30].previous).toBeNull(); // setembro não tem dia 31
  });

  it("média por dia com registro sempre; média corrida e projeção só com cobertura total", () => {
    const partial = summarizePace(days("2026-10", 31, { 1: ["1000", true, true], 2: ["0", false, false], 3: ["500", true, true] }), days("2026-09", 30, { 1: ["300", true, true] }), "2026-10", "2026-10-03");
    expect(partial).toMatchObject({ elapsed: 3, total: 1500n, daysWithRecords: 2, coveredDays: 2, perRecordedDay: 750n, perCalendarDay: null, projection: null, previousSamePeriod: 300n });
    const full = summarizePace(days("2026-10", 31, { 1: ["1000", true, true], 2: ["0", false, true], 3: ["500", true, true] }), [], "2026-10", "2026-10-03");
    expect([full.perCalendarDay, full.projection]).toEqual([500n, 15500n]);
    const past = summarizePace(days("2026-09", 30, Object.fromEntries(Array.from({ length: 30 }, (_, i) => [i + 1, ["100", true, true]]))), [], "2026-09", "2026-10-17");
    expect([past.perCalendarDay, past.projection]).toEqual([100n, null]); // mês fechado: sem projeção
  });

  it("arredonda médias de centavos sem float", () => {
    expect(divRound(1000n, 3n)).toBe(333n);
    expect(divRound(1001n, 2n)).toBe(501n);
    expect(divRound(-1001n, 2n)).toBe(-501n);
  });
});

describe("mapa de calor", () => {
  it("distingue gasto, só estorno, zero confirmado, sem cobertura e futuro", () => {
    const cells = buildHeatmap(days("2026-10", 6, { 1: ["1000", true, false], 2: ["250", true, true], 3: ["-100", true, true], 4: ["0", false, true], 5: ["0", false, false], 6: ["0", false, false] }), "2026-10-05");
    expect(cells.map(c => [c.state, c.level])).toEqual([["spent", 4], ["spent", 1], ["credit", 0], ["confirmed_zero", 0], ["no_coverage", 0], ["future", 0]]);
  });
});

describe("categorias", () => {
  it("soma subcategorias na principal uma única vez e calcula participação", () => {
    const cats = [
      { id: "ali", parent_id: null, name: "Alimentação", sort_order: 1 },
      { id: "sup", parent_id: "ali", name: "Supermercado", sort_order: 5 },
      { id: "pad", parent_id: "ali", name: "Padarias", sort_order: 6 },
      { id: "tra", parent_id: null, name: "Transporte", sort_order: 5 },
    ];
    const { slices, total } = rankCategories([
      { category_id: "sup", side: "expense", total_cents: "7500", tx_count: 2 },
      { category_id: "pad", side: "expense", total_cents: "1234", tx_count: 1 },
      { category_id: "ali", side: "expense", total_cents: "266", tx_count: 1 },
      { category_id: null, side: "expense", total_cents: "1000", tx_count: 1 },
      { category_id: "tra", side: "expense", total_cents: "0", tx_count: 1 },
      { category_id: "sup", side: "income", total_cents: "999", tx_count: 1 },
    ], cats, "expense");
    expect(total).toBe(10000n);
    expect(slices.map(s => [s.name, s.cents, s.share])).toEqual([["Alimentação", 9000n, 90], ["Sem categoria", 1000n, 10]]);
    expect(slices[0].children.map(c => c.name)).toEqual(["Supermercado", "Padarias", "Alimentação (geral)"]);
  });
});
