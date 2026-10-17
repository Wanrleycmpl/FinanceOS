import type { Metadata } from "next";
import Link from "next/link";
import { PaceChart } from "@/components/charts/pace-chart";
import { SpendingHeatmap } from "@/components/charts/spending-heatmap";
import { buttonVariants, Card, PageHeader, Select } from "@/components/ui";
import { describeStatement, STATEMENT_STATUS_LABEL } from "@/lib/cards";
import { buildHeatmap, buildPace, rankCategories, summarizePace } from "@/lib/dashboard";
import { monthlyEquivalent, upcomingCharges } from "@/lib/subscriptions";
import { ACCOUNT_KIND_LABEL, getAccounts, getCardOverview, getCards, getCardStatements, getSubscriptions, getBalances, getCategories, getCategoryTotals, getDailySpending, getProfile, getSummary, listTransactions } from "@/lib/data";
import { formatDateBR, todayInBrazil } from "@/lib/dates";
import { centsFromText, formatBRL, sumCents } from "@/lib/money";
import { filtersToQuery, monthLabel, NATURE_LABEL, parseFilters, shiftMonth } from "@/lib/transactions";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Visão geral" };

function Stat({ label, value, note, tone }: { label: string; value: string; note: React.ReactNode; tone?: "good" | "bad" | "muted" }) {
  return (
    <Card>
      <p className="text-sm text-muted">{label}</p>
      <p className={cn("tabular mt-2 text-2xl font-semibold", tone === "good" && "text-brand", tone === "bad" && "text-danger", tone === "muted" && "text-muted")}>{value}</p>
      <p className="mt-2 text-xs text-muted">{note}</p>
    </Card>
  );
}

export default async function Page(props: PageProps<"/visao-geral">) {
  const today = todayInBrazil();
  const params = await props.searchParams;
  const base = parseFilters(params, today);
  const f = { ...base, day: null, category: null, nature: null, status: null, q: null, showHidden: false, trash: false, page: 1 };
  const prevMonth = shiftMonth(f.month, -1);

  const [accounts, balances, profile, categories, summary, daily, prevDaily, totals, recent] = await Promise.all([
    getAccounts(), getBalances(), getProfile(), getCategories(), getSummary(f),
    getDailySpending(f.month, f.account), getDailySpending(prevMonth, f.account), getCategoryTotals(f.month, f.account),
    listTransactions(f, [], 6),
  ]);
  const scope = accounts.filter(a => !a.archived_at && (!f.account || a.id === f.account));
  const balanceOf = (id: string) => centsFromText(balances.get(id)?.balance ?? "0");
  const total = sumCents(scope.map(a => balanceOf(a.id)));
  const pending = sumCents(scope.map(a => centsFromText(balances.get(a.id)?.pending ?? "0")));
  const hasData = summary.operationalCount > 0;
  const pace = summarizePace(daily, prevDaily, f.month, today);
  const points = buildPace(daily, prevDaily, f.month, today);
  const heat = buildHeatmap(daily, today);
  const expenses = rankCategories(totals, categories, "expense");
  const income = rankCategories(totals, categories, "income");
  const byId = new Map(accounts.map(a => [a.id, a]));
  const query = filtersToQuery(f);
  const accountQuery = f.account ? `&conta=${f.account}` : "";
  const firstName = profile.displayName.split(" ")[0];
  const diff = pace.previousSamePeriod !== null ? pace.total - pace.previousSamePeriod : null;

  // Cards: limit is never money in an account; upcoming bills come from the registered transactions.
  const [cards, cardOverview, subscriptions] = await Promise.all([getCards(), getCardOverview(), getSubscriptions()]);
  // Subscriptions: forecasts only (never an expense until the real charge is registered).
  const nextCharges = upcomingCharges(subscriptions, today).slice(0, 5);
  const subsMonthly = subscriptions.filter(s => s.status === "active").reduce((sum, s) => sum + monthlyEquivalent(BigInt(s.amount_cents), s.period).cents, 0n);
  const activeCards = cards.filter(c => !c.archived_at);
  const cardLimit = activeCards.reduce((s, c) => s + centsFromText(cardOverview.get(c.id)?.limit ?? c.limit_cents), 0n);
  const cardCommitted = activeCards.reduce((s, c) => s + centsFromText(cardOverview.get(c.id)?.committed ?? "0"), 0n);
  const bills = (await Promise.all(activeCards.map(async c => (await getCardStatements(c.id))
    .map(r => ({ card: c, ...describeStatement(r, c, today) }))
    .filter(b => b.remaining > 0n && b.status !== "open" && b.status !== "paid"))))
    .flat().sort((a, b) => a.due.localeCompare(b.due)).slice(0, 4);

  return (
    <>
      <PageHeader title={firstName ? `Olá, ${firstName}` : "Visão geral"} description={`${monthLabel(f.month)}${f.account && byId.get(f.account) ? ` · ${byId.get(f.account)!.name}` : " · todas as contas"}. Resultado do mês e saldo das contas são indicadores diferentes.`}>
        <form action="/visao-geral" className="flex flex-wrap items-end gap-2">
          <label className="grid gap-1 text-xs text-muted">Mês<input type="month" name="mes" defaultValue={f.month} className="h-8 rounded-lg border border-line bg-surface-2 px-2 text-sm text-ink" /></label>
          <label className="grid gap-1 text-xs text-muted">Conta
            <Select name="conta" defaultValue={f.account ?? ""} className="h-8 w-44">
              <option value="">Todas as contas</option>
              {accounts.filter(a => !a.archived_at).map(a => <option key={a.id} value={a.id}>{a.institution_name} · {a.name}</option>)}
            </Select>
          </label>
          <button className={buttonVariants({ variant: "secondary", size: "sm" })}>Ver</button>
        </form>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Stat label={f.account ? "Saldo da conta hoje" : "Saldo consolidado hoje"} value={scope.length ? formatBRL(total) : "—"}
          note={<>Saldo inicial + lançamentos liquidados{f.account ? "" : ` de ${scope.length} contas ativas`}.{pending !== 0n && ` Pendentes: ${formatBRL(pending)}.`}</>} />
        <Stat label="Resultado do mês" value={hasData ? formatBRL(summary.result) : "Sem dados"} tone={!hasData ? "muted" : summary.result >= 0n ? "good" : "bad"}
          note={hasData ? `Receitas ${formatBRL(summary.income)} − despesas líquidas ${formatBRL(summary.netExpense)}.` : "Nenhuma receita ou despesa liquidada — não mostramos zero no lugar de “sem registro”."} />
        <Stat label="Despesas líquidas" value={hasData ? formatBRL(summary.netExpense) : "—"}
          note={summary.refunds > 0n ? `Já descontados ${formatBRL(summary.refunds)} em estornos.` : "Despesas menos estornos/cashback."} />
        <Stat label={`Comparado a ${monthLabel(prevMonth).split(" ")[0].toLowerCase()}`} value={diff === null ? "—" : `${diff > 0n ? "+" : ""}${formatBRL(diff)}`} tone={diff === null ? "muted" : undefined}
          note={pace.elapsed === 0 ? "Mês ainda não começou." : `Gasto líquido do dia 1 ao ${pace.elapsed}: ${formatBRL(pace.total)} agora × ${formatBRL(pace.previousSamePeriod ?? 0n)} no mesmo intervalo de ${monthLabel(prevMonth).split(" ")[0].toLowerCase()}.`} />
      </div>

      {activeCards.length > 0 && (
        <Card className="mt-6">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="font-medium">Cartões de crédito</h2>
            <Link href="/cartoes" className={buttonVariants({ variant: "ghost", size: "sm" })}>Ver faturas</Link>
          </div>
          <div className="grid gap-4 md:grid-cols-[1fr_1.4fr]">
            <dl className="tabular grid grid-cols-3 gap-3 text-sm">
              <div><dt className="text-xs text-muted">Limite</dt><dd className="font-medium">{formatBRL(cardLimit)}</dd></div>
              <div><dt className="text-xs text-muted">Comprometido</dt><dd className="font-medium">{formatBRL(cardCommitted)}</dd></div>
              <div><dt className="text-xs text-muted">Disponível</dt><dd className={cn("font-medium", cardLimit - cardCommitted < 0n && "text-danger")}>{formatBRL(cardLimit - cardCommitted)}</dd></div>
              <dd className="col-span-3 text-xs text-muted">Limite de cartão não entra no saldo: é crédito, não dinheiro. Comprometido inclui parcelas futuras.</dd>
            </dl>
            <div>
              <p className="mb-1 text-xs text-muted">Próximos vencimentos (faturas fechadas a pagar)</p>
              {bills.length === 0 ? <p className="text-sm text-muted">Nenhuma fatura fechada em aberto.</p> : (
                <ul className="divide-y divide-line text-sm">
                  {bills.map(b => (
                    <li key={`${b.card.id}-${b.month}`}>
                      <Link href={`/cartoes?cartao=${b.card.id}&fatura=${b.month.slice(0, 7)}`} className="flex items-center gap-3 py-2 hover:underline">
                        <span className="tabular w-20 text-xs text-muted">{formatDateBR(b.due)}</span>
                        <span className="min-w-0 flex-1 truncate">{b.card.name}</span>
                        <span className={cn("text-xs", b.status.startsWith("late") ? "text-danger" : "text-warning")}>{STATEMENT_STATUS_LABEL[b.status]}</span>
                        <span className="tabular">{formatBRL(b.remaining)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Card>
      )}

      {subscriptions.some(s => s.status === "active") && (
        <Card className="mt-6">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="font-medium">Assinaturas: próximas cobranças</h2>
            <Link href="/assinaturas" className={buttonVariants({ variant: "ghost", size: "sm" })}>Ver assinaturas</Link>
          </div>
          <p className="mb-2 text-xs text-muted">Previsões dos próximos 30 dias (não são despesas até você registrar a cobrança). Total mensal equivalente das ativas: <span className="tabular text-ink">{formatBRL(subsMonthly)}</span>.</p>
          {nextCharges.length === 0 ? <p className="text-sm text-muted">Nenhuma cobrança prevista nos próximos 30 dias.</p> : (
            <ul className="divide-y divide-line text-sm">
              {nextCharges.map(s => (
                <li key={s.id} className="flex items-center gap-3 py-2">
                  <span className="tabular w-20 text-xs text-muted">{formatDateBR(s.next_charge_date)}</span>
                  <span className="min-w-0 flex-1 truncate">{s.name}</span>
                  {s.overdue && <span className="text-xs text-warning">data passou</span>}
                  <span className="tabular">{formatBRL(BigInt(s.amount_cents))}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Card>
          <h2 className="mb-1 font-medium">Ritmo de gastos</h2>
          <p className="mb-4 text-xs text-muted">Gasto líquido (despesas − estornos), sem transferências e movimentações financeiras.</p>
          <PaceChart points={points} currentLabel={monthLabel(f.month)} previousLabel={monthLabel(prevMonth)} />
          <dl className="mt-4 grid gap-3 border-t border-line pt-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted">Média por dia com registro</dt>
              <dd className="tabular font-medium">{pace.perRecordedDay !== null ? formatBRL(pace.perRecordedDay) : "—"}</dd>
              <dd className="text-xs text-muted">{pace.daysWithRecords ? `${formatBRL(pace.total)} ÷ ${pace.daysWithRecords} dia(s) com lançamento` : "Nenhum dia com gasto registrado"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Média por dia corrido</dt>
              <dd className="tabular font-medium">{pace.perCalendarDay !== null ? formatBRL(pace.perCalendarDay) : "Indisponível"}</dd>
              <dd className="text-xs text-muted">{pace.perCalendarDay !== null ? `${formatBRL(pace.total)} ÷ ${pace.elapsed} dias` : `Exige extrato importado cobrindo todos os ${pace.elapsed} dias; cobertos: ${pace.coveredDays}.`}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Projeção do mês</dt>
              <dd className="tabular font-medium">{pace.projection !== null ? formatBRL(pace.projection) : "Indisponível"}</dd>
              <dd className="text-xs text-muted">{pace.projection !== null ? `média por dia corrido × ${daily.length} dias` : "Só para o mês atual com todos os dias cobertos por extrato."}</dd>
            </div>
          </dl>
        </Card>

        <Card>
          <h2 className="mb-1 font-medium">Mapa de calor</h2>
          <p className="mb-4 text-xs text-muted">Clique num dia para ver as transações dele. Dias sem cobertura não são tratados como zero.</p>
          <SpendingHeatmap cells={heat} query={`mes=${f.month}${accountQuery}`} />
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="p-0">
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <h2 className="font-medium">Principais categorias de despesa</h2>
            <Link href={`/categorias?mes=${f.month}${accountQuery}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>Ver todas</Link>
          </div>
          {expenses.slices.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted">Sem despesas liquidadas neste mês.</p>
          ) : (
            <ul className="divide-y divide-line">
              {expenses.slices.slice(0, 5).map(s => (
                <li key={s.id ?? "none"}>
                  <Link href={`/transacoes?mes=${f.month}${accountQuery}${s.id ? `&categoria=${s.id}` : "&natureza=expense"}`} className="grid gap-1.5 px-5 py-3 hover:bg-surface-2">
                    <span className="flex items-center justify-between gap-3 text-sm"><span className="truncate">{s.name}</span><span className="tabular">{formatBRL(s.cents)}</span></span>
                    <span className="flex items-center gap-2">
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3"><span className="block h-full rounded-full bg-[#3987e5]" style={{ width: `${s.share}%` }} /></span>
                      <span className="tabular w-12 text-right text-xs text-muted">{s.share.toLocaleString("pt-BR")}%</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {income.total > 0n && <p className="border-t border-line px-5 py-3 text-xs text-muted">Receitas do mês: {formatBRL(income.total)} (ver em Categorias).</p>}
        </Card>

        <Card className="p-0">
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <h2 className="font-medium">Transações recentes</h2>
            <Link href={`/transacoes?${query}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>Ver todas</Link>
          </div>
          {recent.rows.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted">Nenhum lançamento em {monthLabel(f.month).toLowerCase()}. <Link className="text-brand hover:underline" href={`/transacoes?mes=${f.month}&novo=1`}>Adicionar</Link> ou <Link className="text-brand hover:underline" href="/transacoes/importar">importar CSV</Link>.</p>
          ) : (
            <ul className="divide-y divide-line">
              {recent.rows.map(t => (
                <li key={t.id} className="flex items-center gap-4 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate">{t.description}</p>
                    <p className="text-xs text-muted">{formatDateBR(t.date)} · {t.card_id && !t.account_id ? "Cartão" : byId.get(t.account_id ?? "")?.name}{t.nature !== "income" && t.nature !== "expense" && ` · ${NATURE_LABEL[t.nature]}`}{t.status === "pending" && " · pendente"}</p>
                  </div>
                  <p className={cn("tabular", t.nature === "transfer" || t.nature === "card_payment" ? "text-muted" : t.direction === "in" ? "text-brand" : "")}>{t.nature === "transfer" || t.nature === "card_payment" ? "" : t.direction === "in" ? "+" : "−"}{formatBRL(centsFromText(t.amount_cents))}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-6 p-0">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="font-medium">Saldos por conta</h2>
          <Link href="/contas" className={buttonVariants({ variant: "ghost", size: "sm" })}>Gerenciar</Link>
        </div>
        {scope.length === 0 ? (
          <div className="grid justify-items-start gap-3 px-5 py-6">
            <p className="text-sm text-muted">Você ainda não cadastrou contas. Comece pela conta onde recebe seu salário.</p>
            <Link href="/contas" className={buttonVariants({ size: "sm" })}>Adicionar conta</Link>
          </div>
        ) : (
          <ul className="grid divide-y divide-line sm:grid-cols-2 sm:divide-y-0">
            {scope.map(a => (
              <li key={a.id} className="flex items-center gap-4 border-line px-5 py-3 sm:border-b">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{a.name}</p>
                  <p className="text-xs text-muted">{a.institution_name} · {ACCOUNT_KIND_LABEL[a.kind]}</p>
                </div>
                <p className="tabular font-medium">{formatBRL(balanceOf(a.id))}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
