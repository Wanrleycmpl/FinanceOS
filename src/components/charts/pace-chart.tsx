"use client";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS, SERIES, TICK } from "@/lib/chart-colors";
import type { PacePoint } from "@/lib/dashboard";
import { formatBRL } from "@/lib/money";
import { cn } from "@/lib/utils";

// Numbers are used only for drawing; every label comes from the exact cents strings.
const reais = (cents: string | null) => (cents === null ? null : Number(cents) / 100);
const compact = (v: number) => new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(v);
const money = (cents: string | null) => (cents === null ? "—" : formatBRL(BigInt(cents)));

type Row = PacePoint & { dailyR: number | null; cumulativeR: number | null; previousR: number | null };

function TooltipBox({ active, payload, mode, currentLabel, previousLabel }: { active?: boolean; payload?: { payload: Row }[]; mode: "daily" | "cumulative"; currentLabel: string; previousLabel: string }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium text-ink">Dia {p.day}</p>
      {mode === "daily" ? (
        <p className="text-muted">Gasto líquido: <span className="tabular text-ink">{money(p.daily)}</span></p>
      ) : (
        <>
          <p className="text-muted"><span aria-hidden className="mr-1 inline-block size-2 rounded-full" style={{ background: SERIES[0] }} />{currentLabel}: <span className="tabular text-ink">{money(p.cumulative)}</span></p>
          <p className="text-muted"><span aria-hidden className="mr-1 inline-block size-2 rounded-full" style={{ background: SERIES[1] }} />{previousLabel}: <span className="tabular text-ink">{money(p.previous)}</span></p>
        </>
      )}
    </div>
  );
}

export function PaceChart({ points, currentLabel, previousLabel }: { points: PacePoint[]; currentLabel: string; previousLabel: string }) {
  const [mode, setMode] = useState<"daily" | "cumulative">("cumulative");
  const data: Row[] = points.map(p => ({ ...p, dailyR: reais(p.daily), cumulativeR: reais(p.cumulative), previousR: reais(p.previous) }));
  const axes = (
    <>
      <CartesianGrid vertical={false} stroke={AXIS} />
      <XAxis dataKey="day" tickLine={false} axisLine={{ stroke: AXIS }} tick={{ fill: TICK, fontSize: 11 }} interval="preserveStartEnd" minTickGap={12} />
      <YAxis tickLine={false} axisLine={false} tick={{ fill: TICK, fontSize: 11 }} tickFormatter={compact} width={48} />
    </>
  );

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Tipo de gráfico" className="inline-flex rounded-lg border border-line p-0.5">
          {(["cumulative", "daily"] as const).map(m => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}
              className={cn("rounded-md px-3 py-1 text-xs", mode === m ? "bg-surface-3 text-ink" : "text-muted hover:text-ink")}>
              {m === "cumulative" ? "Acumulado" : "Diário"}
            </button>
          ))}
        </div>
        {mode === "cumulative" && (
          <ul className="flex flex-wrap gap-4 text-xs text-muted" aria-label="Legenda">
            <li className="inline-flex items-center gap-1.5"><span aria-hidden className="h-0.5 w-4" style={{ background: SERIES[0] }} />{currentLabel}</li>
            <li className="inline-flex items-center gap-1.5"><span aria-hidden className="h-0 w-4 border-t-2 border-dashed" style={{ borderColor: SERIES[1] }} />{previousLabel}</li>
          </ul>
        )}
      </div>
      <div className="h-64" role="img" aria-label={mode === "cumulative" ? `Gasto acumulado por dia: ${currentLabel} comparado a ${previousLabel}` : `Gasto líquido por dia em ${currentLabel}`}>
        <ResponsiveContainer width="100%" height="100%">
          {mode === "cumulative" ? (
            <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              {axes}
              <Tooltip content={<TooltipBox mode="cumulative" currentLabel={currentLabel} previousLabel={previousLabel} />} cursor={{ stroke: TICK, strokeDasharray: "3 3" }} />
              <Line type="monotone" dataKey="previousR" stroke={SERIES[1]} strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} connectNulls={false} />
              <Line type="monotone" dataKey="cumulativeR" stroke={SERIES[0]} strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} connectNulls={false} />
            </LineChart>
          ) : (
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap={2}>
              {axes}
              <Tooltip content={<TooltipBox mode="daily" currentLabel={currentLabel} previousLabel={previousLabel} />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
              <Bar dataKey="dailyR" fill={SERIES[0]} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
      <details className="mt-3 text-xs text-muted">
        <summary className="cursor-pointer hover:text-ink">Ver os valores em tabela</summary>
        <div className="mt-2 max-h-56 overflow-auto">
          <table className="w-full">
            <thead><tr className="text-left"><th className="py-1 font-medium">Dia</th><th className="py-1 text-right font-medium">No dia</th><th className="py-1 text-right font-medium">Acumulado</th><th className="py-1 text-right font-medium">{previousLabel}</th></tr></thead>
            <tbody className="tabular">
              {points.filter(p => p.daily !== null || p.previous !== null).map(p => (
                <tr key={p.day} className="border-t border-line"><td className="py-1">{p.day}</td><td className="py-1 text-right">{money(p.daily)}</td><td className="py-1 text-right">{money(p.cumulative)}</td><td className="py-1 text-right">{money(p.previous)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
