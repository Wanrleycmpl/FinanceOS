"use client";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { OTHER, SERIES } from "@/lib/chart-colors";
import { formatBRL } from "@/lib/money";

export type DonutSlice = { name: string; cents: string; share: number };

// Expenses only (income is shown separately). Up to 7 slices + "Outros"; each slice also has a
// labeled row in the legend, so color is never the only way to tell them apart.
export function CategoryDonut({ slices, total }: { slices: DonutSlice[]; total: string }) {
  const shown = slices.length > 8 ? [...slices.slice(0, 7), {
    name: "Outros",
    cents: slices.slice(7).reduce((s, x) => s + BigInt(x.cents), 0n).toString(),
    share: Math.round(slices.slice(7).reduce((s, x) => s + x.share, 0) * 100) / 100,
  }] : slices;
  const color = (i: number, name: string) => (name === "Outros" && i === 7 ? OTHER : SERIES[i]);
  const data = shown.map(s => ({ ...s, value: Number(s.cents) / 100 }));

  return (
    <div className="grid items-center gap-4 sm:grid-cols-[180px_1fr]">
      <div className="relative h-44" role="img" aria-label={`Despesas por categoria, total ${formatBRL(BigInt(total))}`}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="100%" paddingAngle={1.5} stroke="#121816" strokeWidth={2} isAnimationActive={false}>
              {data.map((s, i) => <Cell key={s.name} fill={color(i, s.name)} />)}
            </Pie>
            <Tooltip content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const s = payload[0].payload as DonutSlice;
              return <div className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs shadow-lg"><p className="font-medium text-ink">{s.name}</p><p className="tabular text-muted">{formatBRL(BigInt(s.cents))} · {s.share.toLocaleString("pt-BR")}%</p></div>;
            }} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div><p className="text-[10px] text-muted">Total</p><p className="tabular text-sm font-semibold">{formatBRL(BigInt(total))}</p></div>
        </div>
      </div>
      <ul className="grid gap-1.5 text-sm">
        {shown.map((s, i) => (
          <li key={s.name} className="flex items-center gap-2">
            <span aria-hidden className="size-2.5 shrink-0 rounded-sm" style={{ background: color(i, s.name) }} />
            <span className="min-w-0 flex-1 truncate">{s.name}</span>
            <span className="tabular text-muted">{s.share.toLocaleString("pt-BR")}%</span>
            <span className="tabular w-28 text-right">{formatBRL(BigInt(s.cents))}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
