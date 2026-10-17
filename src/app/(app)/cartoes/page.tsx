import type { Metadata } from "next";
import Link from "next/link";
import { CreditCard as CardIcon, Plus } from "lucide-react";
import { setCardArchived } from "@/app/actions/cards";
import { CardForm } from "@/components/forms";
import { Badge, Button, buttonVariants, Card, PageHeader } from "@/components/ui";
import { describeStatement, STATEMENT_STATUS_LABEL, statementFor, type StatementStatus } from "@/lib/cards";
import { getCardOverview, getCards, getCardStatements, getCategories, getStatementTransactions, type CreditCard, type Transaction } from "@/lib/data";
import { formatDateBR, todayInBrazil } from "@/lib/dates";
import { centsFromText, centsToInput, formatBRL } from "@/lib/money";
import { monthLabel } from "@/lib/transactions";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Cartões e faturas" };

const FEE_KEYS = new Set(["financas.01", "financas.02", "financas.03"]);
const STATUS_TONE: Record<StatementStatus, string> = {
  open: "border-[#3987e5]/50 text-[#86b6ef]",
  closed: "border-warning/40 text-warning",
  paid: "border-brand/40 text-brand",
  partial: "border-warning/40 text-warning",
  late: "border-danger/50 text-danger",
  late_partial: "border-danger/50 text-danger",
  credit: "border-brand/40 text-brand",
};
const cardTitle = (c: CreditCard) => `${c.name}${c.last4 ? ` •••• ${c.last4}` : ""}`;

function LimitBar({ limit, committed }: { limit: bigint; committed: bigint }) {
  const pct = limit > 0n ? Math.min(100, Number((committed * 1000n) / limit) / 10) : committed > 0n ? 100 : 0;
  return (
    <div className="h-2 overflow-hidden rounded-full bg-surface-3" role="img" aria-label={`${pct.toLocaleString("pt-BR")}% do limite comprometido`}>
      <div className={cn("h-full rounded-full", committed > limit ? "bg-danger" : "bg-[#3987e5]")} style={{ width: `${Math.max(pct, committed > 0n ? 2 : 0)}%` }} />
    </div>
  );
}

function TxList({ title, rows, sign }: { title: string; rows: Transaction[]; sign: "+" | "−" }) {
  if (!rows.length) return null;
  return (
    <div>
      <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">{title}</h4>
      <ul className="divide-y divide-line">
        {rows.map(t => (
          <li key={t.id} className="flex items-center gap-3 py-2 text-sm">
            <span className="tabular w-20 shrink-0 text-xs text-muted">{formatDateBR(t.date)}</span>
            <span className="min-w-0 flex-1 truncate">{t.description}{t.status === "pending" && <Badge className="ml-2 border-warning/40 text-warning">Futuro</Badge>}</span>
            <span className="tabular">{sign}{formatBRL(centsFromText(t.amount_cents))}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function Page(props: PageProps<"/cartoes">) {
  const params = await props.searchParams;
  const one = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : "");
  const today = todayInBrazil();
  const [cards, overview] = await Promise.all([getCards(), getCardOverview()]);
  const showArchived = one("arquivados") === "1";
  const visible = cards.filter(c => showArchived || !c.archived_at);
  const selected = cards.find(c => c.id === one("cartao")) ?? visible[0];
  const editing = one("editar") === "1" && selected ? selected : undefined;
  const archivedCount = cards.filter(c => c.archived_at).length;

  const totals = visible.filter(c => !c.archived_at).reduce((acc, c) => {
    const o = overview.get(c.id);
    acc.limit += centsFromText(o?.limit ?? c.limit_cents);
    acc.committed += centsFromText(o?.committed ?? "0");
    return acc;
  }, { limit: 0n, committed: 0n });

  let statements: ReturnType<typeof describeStatement>[] = [];
  let detail: { s: ReturnType<typeof describeStatement>; rows: Transaction[] } | null = null;
  let feeIds = new Set<string>();
  if (selected) {
    const [raw, categories] = await Promise.all([getCardStatements(selected.id), getCategories()]);
    statements = raw.map(r => describeStatement(r, selected, today)).reverse();
    const currentMonth = statementFor(today, selected.closing_day);
    const wanted = /^\d{4}-\d{2}$/.test(one("fatura")) ? `${one("fatura")}-01` : (statements.find(s => s.month === currentMonth) ?? statements.find(s => s.month <= currentMonth) ?? statements[statements.length - 1])?.month;
    const s = statements.find(x => x.month === wanted);
    if (s) {
      const rows = await getStatementTransactions(selected.id, s.month);
      feeIds = new Set(categories.filter(c => c.template_key && FEE_KEYS.has(c.template_key)).map(c => c.id));
      detail = { s, rows };
    }
  }

  return (
    <>
      <PageHeader title="Cartões e faturas" description="Compras no cartão contam como gasto na data da compra e aumentam a dívida do cartão; o pagamento da fatura só tira dinheiro da conta. Limite não é dinheiro disponível.">
        <div className="flex flex-wrap gap-2">
          {archivedCount > 0 && (
            <Link href={showArchived ? "/cartoes" : "/cartoes?arquivados=1"} className={buttonVariants({ variant: "secondary", size: "sm" })}>
              {showArchived ? "Ocultar arquivados" : `Mostrar arquivados (${archivedCount})`}
            </Link>
          )}
          <Link href="/cartoes?novo=1" className={buttonVariants({ size: "sm" })}><Plus aria-hidden className="size-4" />Novo cartão</Link>
        </div>
      </PageHeader>

      {(one("novo") === "1" || cards.length === 0) && (
        <Card className="mb-6">
          <h2 className="mb-4 font-medium">Novo cartão</h2>
          <CardForm />
        </Card>
      )}

      {visible.length > 0 && (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <Card><p className="text-sm text-muted">Limite total</p><p className="tabular mt-2 text-2xl font-semibold">{formatBRL(totals.limit)}</p><p className="mt-2 text-xs text-muted">Soma dos cartões ativos.</p></Card>
            <Card><p className="text-sm text-muted">Comprometido</p><p className="tabular mt-2 text-2xl font-semibold">{formatBRL(totals.committed)}</p><p className="mt-2 text-xs text-muted">Compras − estornos − pagamentos já feitos, incluindo lançamentos futuros (parcelas).</p></Card>
            <Card><p className="text-sm text-muted">Disponível</p><p className={cn("tabular mt-2 text-2xl font-semibold", totals.limit - totals.committed < 0n && "text-danger")}>{formatBRL(totals.limit - totals.committed)}</p><p className="mt-2 text-xs text-muted">Limite − comprometido. Não é dinheiro em conta.</p></Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
            <ul className="grid content-start gap-3">
              {visible.map(c => {
                const o = overview.get(c.id);
                const limit = centsFromText(o?.limit ?? c.limit_cents), committed = centsFromText(o?.committed ?? "0");
                const active = selected?.id === c.id;
                return (
                  <li key={c.id}>
                    <Link href={`/cartoes?cartao=${c.id}${showArchived ? "&arquivados=1" : ""}`} aria-current={active ? "true" : undefined}
                      className={cn("grid gap-2 rounded-xl border bg-surface p-4 hover:bg-surface-2", active ? "border-brand/60" : "border-line")}>
                      <span className="flex items-center gap-2">
                        <CardIcon aria-hidden className="size-4 text-muted" />
                        <span className="flex-1 font-medium">{cardTitle(c)}</span>
                        {c.archived_at && <Badge>Arquivado</Badge>}
                      </span>
                      <span className="text-xs text-muted">{c.institution_name} · fecha dia {c.closing_day} · vence dia {c.due_day}</span>
                      <LimitBar limit={limit} committed={committed} />
                      <span className="tabular flex justify-between text-xs">
                        <span className="text-muted">Comprometido {formatBRL(committed)}</span>
                        <span className={limit - committed < 0n ? "text-danger" : ""}>Disponível {formatBRL(limit - committed)}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>

            {selected && (
              <div className="grid content-start gap-6">
                <Card>
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-medium">{cardTitle(selected)}</h2>
                    <div className="flex gap-1">
                      <Link href={`/transacoes?novo=1`} className={buttonVariants({ variant: "secondary", size: "sm" })}>Nova compra</Link>
                      {!selected.archived_at && <Link href={`/cartoes?cartao=${selected.id}&editar=1`} className={buttonVariants({ variant: "ghost", size: "sm" })}>Editar</Link>}
                      <form action={setCardArchived}>
                        <input type="hidden" name="id" value={selected.id} />
                        <input type="hidden" name="archive" value={selected.archived_at ? "0" : "1"} />
                        <Button variant="ghost" size="sm">{selected.archived_at ? "Restaurar" : "Arquivar"}</Button>
                      </form>
                    </div>
                  </div>
                  {editing ? (
                    <CardForm card={{ id: editing.id, institution: editing.institution_name, name: editing.name, last4: editing.last4 ?? "", limit: centsToInput(centsFromText(editing.limit_cents)), closing_day: editing.closing_day, due_day: editing.due_day }} />
                  ) : statements.length === 0 ? (
                    <p className="text-sm text-muted">Nenhuma compra neste cartão ainda. Em Transações → Novo lançamento → Despesa, escolha este cartão em “Pago com”.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="text-left text-xs text-muted"><tr><th className="py-2 pr-3 font-medium">Fatura</th><th className="py-2 pr-3 font-medium">Fecha</th><th className="py-2 pr-3 font-medium">Vence</th><th className="py-2 pr-3 text-right font-medium">Total</th><th className="py-2 pr-3 text-right font-medium">Pago</th><th className="py-2 font-medium">Situação</th></tr></thead>
                        <tbody className="divide-y divide-line">
                          {statements.map(s => (
                            <tr key={s.month} className={cn(detail?.s.month === s.month && "bg-surface-2")}>
                              <td className="py-2 pr-3"><Link className="hover:underline" href={`/cartoes?cartao=${selected.id}&fatura=${s.month.slice(0, 7)}`}>{monthLabel(s.month.slice(0, 7))}</Link></td>
                              <td className="tabular py-2 pr-3 text-muted">{formatDateBR(s.close)}</td>
                              <td className="tabular py-2 pr-3 text-muted">{formatDateBR(s.due)}</td>
                              <td className="tabular py-2 pr-3 text-right">{formatBRL(s.total)}</td>
                              <td className="tabular py-2 pr-3 text-right text-muted">{formatBRL(s.paid)}</td>
                              <td className="py-2"><Badge className={STATUS_TONE[s.status]}>{STATEMENT_STATUS_LABEL[s.status]}</Badge></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>

                {detail && !editing && (
                  <Card className="grid gap-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="font-medium">Fatura de {monthLabel(detail.s.month.slice(0, 7)).toLowerCase()}</h3>
                        <p className="text-xs text-muted">Fecha em {formatDateBR(detail.s.close)} · vence em {formatDateBR(detail.s.due)} · <Badge className={STATUS_TONE[detail.s.status]}>{STATEMENT_STATUS_LABEL[detail.s.status]}</Badge></p>
                        <p className="mt-1 text-xs text-warning">Estimada: calculada a partir dos lançamentos que você registrou. Confira com a fatura do banco.</p>
                      </div>
                      {detail.s.remaining > 0n && detail.s.status !== "open" && (
                        <Link href={`/transacoes?pagar=${selected.id}&fatura=${detail.s.month.slice(0, 7)}&valor=${encodeURIComponent(centsToInput(detail.s.remaining))}`} className={buttonVariants({ size: "sm" })}>Pagar fatura</Link>
                      )}
                    </div>
                    <dl className="tabular grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
                      <div><dt className="text-xs text-muted">Compras</dt><dd>{formatBRL(detail.s.purchases)}</dd></div>
                      <div><dt className="text-xs text-muted">Encargos</dt><dd>{formatBRL(detail.s.fees)}</dd></div>
                      <div><dt className="text-xs text-muted">Estornos</dt><dd>−{formatBRL(detail.s.credits)}</dd></div>
                      <div><dt className="text-xs text-muted">Pago</dt><dd>{formatBRL(detail.s.paid)}{detail.s.pendingPayments > 0n && <span className="block text-xs text-muted">+ {formatBRL(detail.s.pendingPayments)} agendado</span>}</dd></div>
                      <div><dt className="text-xs text-muted">{detail.s.remaining < 0n ? "Crédito" : "Falta pagar"}</dt><dd className="font-semibold">{formatBRL(detail.s.remaining < 0n ? -detail.s.remaining : detail.s.remaining)}</dd></div>
                    </dl>
                    <TxList title="Compras" sign="−" rows={detail.rows.filter(t => t.nature === "expense" && !(t.category_id && feeIds.has(t.category_id)))} />
                    <TxList title="Encargos (tarifas, juros, multas)" sign="−" rows={detail.rows.filter(t => t.nature === "expense" && t.category_id && feeIds.has(t.category_id))} />
                    <TxList title="Estornos e créditos" sign="+" rows={detail.rows.filter(t => t.nature === "refund")} />
                    <TxList title="Pagamentos" sign="+" rows={detail.rows.filter(t => t.nature === "card_payment")} />
                    <p className="text-xs text-muted">Encargos são despesas lançadas nas categorias Finanças › Tarifas bancárias, Juros e encargos ou Multas financeiras.</p>
                  </Card>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
