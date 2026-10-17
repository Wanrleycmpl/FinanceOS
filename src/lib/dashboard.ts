// Pure calculations for the overview: spending pace, coverage-aware averages, heatmap
// states and category ranking. All money is BigInt cents; Numbers are only chart geometry.
import { monthRange } from "@/lib/transactions";

export type DayRow = { day: string; expense_cents: string; has_records: boolean; covered: boolean };
export type CategoryTotalRow = { category_id: string | null; side: "income" | "expense"; total_cents: string; tx_count: number };
export type CategoryRef = { id: string; parent_id: string | null; name: string; sort_order: number };

/** Integer division rounded half away from zero (for averages of cents). */
export function divRound(total: bigint, n: bigint): bigint {
  if (n <= 0n) throw new Error("divisor must be positive");
  const half = n / 2n;
  return total >= 0n ? (total + half) / n : -((-total + half) / n);
}

/** How many days of the month have already happened (0 for a future month). */
export function elapsedDays(month: string, today: string): number {
  const { to } = monthRange(month);
  if (today < `${month}-01`) return 0;
  if (today > to) return Number(to.slice(8));
  return Number(today.slice(8));
}

export type PacePoint = {
  day: number;
  daily: string | null;        // net spending that day (cents), null for future days
  cumulative: string | null;   // running total up to that day, null for future days
  previous: string | null;     // previous month's running total on the same day number
};

export function buildPace(current: DayRow[], previous: DayRow[], month: string, today: string): PacePoint[] {
  const elapsed = elapsedDays(month, today);
  let run = 0n, prevRun = 0n;
  const prevCum = previous.map(d => (prevRun += BigInt(d.expense_cents)));
  return current.map((d, i) => {
    const future = i + 1 > elapsed;
    if (!future) run += BigInt(d.expense_cents);
    return {
      day: i + 1,
      daily: future ? null : d.expense_cents,
      cumulative: future ? null : run.toString(),
      previous: i < prevCum.length ? prevCum[i].toString() : null,
    };
  });
}

export type PaceSummary = {
  elapsed: number;
  total: bigint;                  // net spending in the elapsed days
  previousSamePeriod: bigint | null; // previous month up to the same day number
  daysWithRecords: number;
  coveredDays: number;            // elapsed days covered by imported statements in every account
  perRecordedDay: bigint | null;  // total ÷ days with records
  perCalendarDay: bigint | null;  // total ÷ elapsed days — only when every elapsed day is covered
  projection: bigint | null;      // perCalendarDay × days in month — only for the current month, fully covered
};

export function summarizePace(current: DayRow[], previous: DayRow[], month: string, today: string): PaceSummary {
  const elapsed = elapsedDays(month, today);
  const past = current.slice(0, elapsed);
  const total = past.reduce((s, d) => s + BigInt(d.expense_cents), 0n);
  const daysWithRecords = past.filter(d => d.has_records).length;
  const coveredDays = past.filter(d => d.covered).length;
  const fullyCovered = elapsed > 0 && coveredDays === elapsed;
  const sameSpan = Math.min(elapsed, previous.length);
  const previousSamePeriod = elapsed > 0 ? previous.slice(0, sameSpan).reduce((s, d) => s + BigInt(d.expense_cents), 0n) : null;
  const perCalendarDay = fullyCovered ? divRound(total, BigInt(elapsed)) : null;
  const isCurrentMonth = today.slice(0, 7) === month;
  return {
    elapsed, total, previousSamePeriod, daysWithRecords, coveredDays,
    perRecordedDay: daysWithRecords > 0 ? divRound(total, BigInt(daysWithRecords)) : null,
    perCalendarDay,
    projection: isCurrentMonth && perCalendarDay !== null && elapsed < current.length ? perCalendarDay * BigInt(current.length) : null,
  };
}

export type HeatState = "spent" | "credit" | "confirmed_zero" | "no_coverage" | "future";
export type HeatCell = { day: string; state: HeatState; cents: bigint; level: 0 | 1 | 2 | 3 | 4 };

/** Never turns "no data" into zero: uncovered days without records are "sem cobertura". */
export function buildHeatmap(days: DayRow[], today: string): HeatCell[] {
  const max = days.reduce((m, d) => (d.day <= today && BigInt(d.expense_cents) > m ? BigInt(d.expense_cents) : m), 0n);
  return days.map(d => {
    const cents = BigInt(d.expense_cents);
    let state: HeatState;
    if (d.day > today) state = "future";
    else if (d.has_records) state = cents > 0n ? "spent" : "credit";
    else state = d.covered ? "confirmed_zero" : "no_coverage";
    // Four steps relative to the month's largest day (ceil, so any spending is at least level 1).
    const level = state === "spent" && max > 0n ? (Number((cents * 4n + max - 1n) / max) as 1 | 2 | 3 | 4) : 0;
    return { day: d.day, state, cents, level };
  });
}

export type CategorySlice = { id: string | null; name: string; cents: bigint; share: number; children: { id: string | null; name: string; cents: bigint }[] };

/**
 * Sums leaf totals into their main category (each transaction counted once; the parent's own
 * transactions are one more leaf, never re-added). Shares use positive totals only.
 */
export function rankCategories(rows: CategoryTotalRow[], categories: CategoryRef[], side: "income" | "expense"): { slices: CategorySlice[]; total: bigint } {
  const byId = new Map(categories.map(c => [c.id, c]));
  const groups = new Map<string | null, CategorySlice>();
  for (const r of rows.filter(r => r.side === side)) {
    const cat = r.category_id ? byId.get(r.category_id) : undefined;
    const parent = cat?.parent_id ? byId.get(cat.parent_id) : cat;
    const key = parent?.id ?? null;
    const g = groups.get(key) ?? { id: key, name: parent?.name ?? "Sem categoria", cents: 0n, share: 0, children: [] };
    const cents = BigInt(r.total_cents);
    g.cents += cents;
    g.children.push({ id: r.category_id, name: cat ? (cat.parent_id ? cat.name : `${cat.name} (geral)`) : "Sem categoria", cents });
    groups.set(key, g);
  }
  const slices = [...groups.values()].filter(g => g.cents > 0n).sort((a, b) => (b.cents > a.cents ? 1 : b.cents < a.cents ? -1 : 0));
  const total = slices.reduce((s, g) => s + g.cents, 0n);
  for (const g of slices) {
    g.share = total > 0n ? Number((g.cents * 10000n) / total) / 100 : 0;
    g.children.sort((a, b) => (b.cents > a.cents ? 1 : b.cents < a.cents ? -1 : 0));
  }
  return { slices, total };
}
