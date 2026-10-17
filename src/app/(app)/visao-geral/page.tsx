import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants, Card, PageHeader } from "@/components/ui";
import { ACCOUNT_KIND_LABEL, getAccounts, getBalances, getCategories, getProfile, getSummary, listTransactions } from "@/lib/data";
import { formatDateBR, todayInBrazil } from "@/lib/dates";
import { centsFromText, formatBRL, sumCents } from "@/lib/money";
import { monthLabel, NATURE_LABEL, parseFilters } from "@/lib/transactions";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Visão geral" };

export default async function Page(props: PageProps<"/visao-geral">) {
  const today = todayInBrazil();
  const f = parseFilters(await props.searchParams, today);
  const [accounts, balances, profile, categories, summary] = await Promise.all([getAccounts(), getBalances(), getProfile(), getCategories(), getSummary(f)]);
  const recent = await listTransactions({ ...f, account: null, category: null, nature: null, status: null, q: null, showHidden: false, trash: false, page: 1 }, categories, 6);
  const active = accounts.filter(a => !a.archived_at);
  const balanceOf = (id: string) => centsFromText(balances.get(id)?.balance ?? "0");
  const total = sumCents(active.map(a => balanceOf(a.id)));
  const pending = sumCents(active.map(a => centsFromText(balances.get(a.id)?.pending ?? "0")));
  const hasData = summary.operationalCount > 0;
  const firstName = profile.displayName.split(" ")[0];
  const byId = new Map(accounts.map(a => [a.id, a]));

  return (
    <>
      <PageHeader title={firstName ? `Olá, ${firstName}` : "Visão geral"} description={`${monthLabel(f.month)}. Resultado do mês e saldo das contas são coisas diferentes.`}>
        <form action="/visao-geral" className="flex items-end gap-2">
          <label className="grid gap-1 text-xs text-muted">Mês<input type="month" name="mes" defaultValue={f.month} className="h-8 rounded-lg border border-line bg-surface-2 px-2 text-sm text-ink" /></label>
          <button className={buttonVariants({ variant: "secondary", size: "sm" })}>Ver</button>
        </form>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <p className="text-sm text-muted">Saldo consolidado hoje</p>
          <p className="tabular mt-2 text-2xl font-semibold">{active.length ? formatBRL(total) : "—"}</p>
          <p className="mt-2 text-xs text-muted">Saldo inicial + lançamentos liquidados das {active.length} contas ativas.{pending !== 0n && ` Pendentes previstos: ${formatBRL(pending)}.`}</p>
        </Card>
        <Card>
          <p className="text-sm text-muted">Resultado do mês</p>
          <p className={cn("tabular mt-2 text-2xl font-semibold", !hasData ? "text-muted" : summary.result >= 0n ? "text-brand" : "text-danger")}>{hasData ? formatBRL(summary.result) : "Sem dados"}</p>
          <p className="mt-2 text-xs text-muted">{hasData ? `Receitas ${formatBRL(summary.income)} − despesas líquidas ${formatBRL(summary.netExpense)}.` : "Nenhuma receita ou despesa liquidada neste mês — não mostramos zero no lugar de “sem registro”."}</p>
        </Card>
        <Card>
          <p className="text-sm text-muted">Despesas líquidas do mês</p>
          <p className="tabular mt-2 text-2xl font-semibold">{hasData ? formatBRL(summary.netExpense) : "—"}</p>
          <p className="mt-2 text-xs text-muted">{summary.refunds > 0n ? `Já descontados estornos de ${formatBRL(summary.refunds)}. ` : ""}Ritmo de gastos, mapa de calor e categorias chegam na Entrega 03.</p>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="p-0">
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <h2 className="font-medium">Saldos por conta</h2>
            <Link href="/contas" className={buttonVariants({ variant: "ghost", size: "sm" })}>Gerenciar</Link>
          </div>
          {active.length === 0 ? (
            <div className="grid justify-items-start gap-3 px-5 py-6">
              <p className="text-sm text-muted">Você ainda não cadastrou contas. Comece pela conta onde recebe seu salário.</p>
              <Link href="/contas" className={buttonVariants({ size: "sm" })}>Adicionar conta</Link>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {active.map(a => (
                <li key={a.id} className="flex items-center gap-4 px-5 py-3">
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

        <Card className="p-0">
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <h2 className="font-medium">Transações recentes do mês</h2>
            <Link href={`/transacoes?mes=${f.month}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>Ver todas</Link>
          </div>
          {recent.rows.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted">Nenhum lançamento em {monthLabel(f.month).toLowerCase()}. <Link className="text-brand hover:underline" href={`/transacoes?mes=${f.month}&novo=1`}>Adicionar</Link></p>
          ) : (
            <ul className="divide-y divide-line">
              {recent.rows.map(t => {
                const cents = centsFromText(t.amount_cents);
                return (
                  <li key={t.id} className="flex items-center gap-4 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate">{t.description}</p>
                      <p className="text-xs text-muted">{formatDateBR(t.date)} · {byId.get(t.account_id)?.name}{t.nature !== "income" && t.nature !== "expense" && ` · ${NATURE_LABEL[t.nature]}`}{t.status === "pending" && " · pendente"}</p>
                    </div>
                    <p className={cn("tabular", t.nature === "transfer" ? "text-muted" : t.direction === "in" ? "text-brand" : "")}>{t.nature === "transfer" ? "" : t.direction === "in" ? "+" : "−"}{formatBRL(cents)}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
