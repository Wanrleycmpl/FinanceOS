import Link from "next/link";
import { HEAT } from "@/lib/chart-colors";
import type { HeatCell, HeatState } from "@/lib/dashboard";
import { formatDateBR } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];
const STATE_TEXT: Record<HeatState, string> = {
  spent: "gasto registrado",
  credit: "só estornos",
  confirmed_zero: "sem gastos (extrato importado)",
  no_coverage: "sem cobertura: pode ter havido gasto não registrado",
  future: "dia futuro",
};

// Calendar heatmap. Clicking a day opens Transactions filtered to that day.
export function SpendingHeatmap({ cells, query }: { cells: HeatCell[]; query: string }) {
  const [y, m] = cells[0].day.split("-").map(Number);
  const offset = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  return (
    <div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-muted" aria-hidden>
        {WEEKDAYS.map((d, i) => <span key={i}>{d}</span>)}
      </div>
      <ol className="mt-1 grid grid-cols-7 gap-1" aria-label="Gastos por dia do mês">
        {Array.from({ length: offset }, (_, i) => <li key={`pad-${i}`} aria-hidden />)}
        {cells.map(c => {
          const n = Number(c.day.slice(8));
          const label = `${formatDateBR(c.day)}: ${c.state === "spent" || c.state === "credit" ? `${formatBRL(c.cents)}, ` : ""}${STATE_TEXT[c.state]}`;
          const style = c.state === "spent" ? { background: HEAT[c.level - 1] } : undefined;
          const box = cn(
            "flex aspect-square items-center justify-center rounded-md text-[11px] tabular",
            c.state === "spent" && (c.level >= 3 ? "text-[#062016]" : "text-white"),
            c.state === "credit" && "border border-brand/50 text-brand",
            c.state === "confirmed_zero" && "bg-surface-3 text-muted",
            c.state === "no_coverage" && "border border-dashed border-line text-muted/60 [background:repeating-linear-gradient(45deg,transparent_0_4px,rgba(154,171,163,0.12)_4px_5px)]",
            c.state === "future" && "text-muted/40",
          );
          return (
            <li key={c.day}>
              {c.state === "future" ? (
                <span className={box} aria-label={label}>{n}</span>
              ) : (
                <Link href={`/transacoes?${query}&dia=${c.day}`} title={label} aria-label={label} style={style}
                  className={cn(box, "outline-offset-1 hover:ring-2 hover:ring-ink/40 focus-visible:outline-2 focus-visible:outline-brand")}>{n}</Link>
              )}
            </li>
          );
        })}
      </ol>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-muted" aria-label="Legenda do mapa">
        <li className="inline-flex items-center gap-1.5"><span aria-hidden className="flex gap-0.5">{HEAT.map(h => <span key={h} className="size-3 rounded-sm" style={{ background: h }} />)}</span>gasto (mais claro = maior)</li>
        <li className="inline-flex items-center gap-1.5"><span aria-hidden className="size-3 rounded-sm bg-surface-3" />sem gastos confirmados</li>
        <li className="inline-flex items-center gap-1.5"><span aria-hidden className="size-3 rounded-sm border border-dashed border-line [background:repeating-linear-gradient(45deg,transparent_0_2px,rgba(154,171,163,0.25)_2px_3px)]" />sem cobertura</li>
        <li className="inline-flex items-center gap-1.5"><span aria-hidden className="size-3 rounded-sm border border-brand/50" />só estornos</li>
      </ul>
    </div>
  );
}
