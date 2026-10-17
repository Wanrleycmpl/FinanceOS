import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants, Card, PageHeader } from "@/components/ui";
import { ACCOUNT_KIND_LABEL, getAccounts, getProfile } from "@/lib/data";
import { formatDateBR } from "@/lib/dates";
import { centsFromText, formatBRL, sumCents } from "@/lib/money";

export const metadata: Metadata = { title: "Visão geral" };

export default async function Page() {
  const [accounts, profile] = await Promise.all([getAccounts(), getProfile()]);
  const active = accounts.filter(a => !a.archived_at);
  const total = sumCents(active.map(a => centsFromText(a.opening_balance_cents)));
  const firstName = profile.displayName.split(" ")[0];

  return (
    <>
      <PageHeader title={firstName ? `Olá, ${firstName}` : "Visão geral"} description="Resumo das suas contas. Receitas, despesas e gráficos chegam com as transações." />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <p className="text-sm text-muted">Saldo inicial informado</p>
          <p className="tabular mt-2 text-2xl font-semibold">{active.length ? formatBRL(total) : "—"}</p>
          <p className="mt-2 text-xs text-muted">Soma dos saldos iniciais das {active.length} contas ativas. Ainda não é o saldo atual: não há lançamentos registrados.</p>
        </Card>
        <Card>
          <p className="text-sm text-muted">Resultado do mês</p>
          <p className="mt-2 text-2xl font-semibold text-muted">Sem dados</p>
          <p className="mt-2 text-xs text-muted">Receitas menos despesas do período. Aparece quando houver transações — nunca mostramos zero no lugar de “sem registro”.</p>
        </Card>
        <Card>
          <p className="text-sm text-muted">Gastos e categorias</p>
          <p className="mt-2 text-2xl font-semibold text-muted">Sem dados</p>
          <p className="mt-2 text-xs text-muted">Ritmo de gastos, mapa de calor e ranking de categorias chegam na próxima entrega.</p>
        </Card>
      </div>

      <Card className="mt-6 p-0">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="font-medium">Saldos por conta</h2>
          <Link href="/contas" className={buttonVariants({ variant: "ghost", size: "sm" })}>Gerenciar contas</Link>
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
                  <p className="text-xs text-muted">{a.institution_name} · {ACCOUNT_KIND_LABEL[a.kind]} · desde {formatDateBR(a.opening_date)}</p>
                </div>
                <p className="tabular font-medium">{formatBRL(centsFromText(a.opening_balance_cents))}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
