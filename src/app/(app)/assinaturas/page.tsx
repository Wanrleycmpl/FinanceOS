import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { registerCharge, setSubscriptionStatus } from "@/app/actions/subscriptions";
import { SubscriptionForm } from "@/components/subscription-form";
import type { CategoryOption } from "@/components/transaction-form";
import { Badge, Button, buttonVariants, Card, Input, PageHeader } from "@/components/ui";
import { getAccounts, getCards, getCategories, getSubscriptionCharges, getSubscriptions } from "@/lib/data";
import { formatDateBR, todayInBrazil } from "@/lib/dates";
import { centsToInput, formatBRL } from "@/lib/money";
import { annualCost, monthlyEquivalent, PERIOD_LABEL } from "@/lib/subscriptions";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Assinaturas" };

const ERRORS: Record<string, string> = {
  dados: "Confira a data e o valor da cobrança.",
  futura: "A cobrança registrada precisa ter acontecido (data até hoje). A previsão já aparece sozinha.",
  abertura: "A data da cobrança é anterior ao saldo inicial da conta.",
  arquivado: "A conta ou o cartão dessa assinatura está arquivado. Edite a assinatura e escolha outro.",
  inativa: "Só assinaturas ativas recebem cobrança. Retome a assinatura antes.",
  falha: "Não foi possível registrar a cobrança. Tente de novo.",
};
const STATUS_LABEL = { active: "Ativa", paused: "Pausada", cancelled: "Cancelada" } as const;

export default async function Page(props: PageProps<"/assinaturas">) {
  const params = await props.searchParams;
  const one = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : "");
  const today = todayInBrazil();
  const [subs, charges, accounts, cards, categories] = await Promise.all([getSubscriptions(), getSubscriptionCharges(), getAccounts(), getCards(), getCategories()]);
  const active = subs.filter(s => s.status === "active");
  const monthlyTotal = active.reduce((sum, s) => sum + monthlyEquivalent(BigInt(s.amount_cents), s.period).cents, 0n);
  const yearlyTotal = active.reduce((sum, s) => sum + annualCost(BigInt(s.amount_cents), s.period), 0n);
  const editing = subs.find(s => s.id === one("editar"));
  const showForm = one("novo") === "1" || Boolean(editing) || subs.length === 0;
  const means = (s: { account_id: string | null; card_id: string | null }) => {
    if (s.card_id) { const c = cards.find(x => x.id === s.card_id); return c ? `Cartão ${c.name}` : "Cartão"; }
    const a = accounts.find(x => x.id === s.account_id); return a ? `${a.institution_name} · ${a.name}` : "Conta";
  };
  const categoryName = (id: string | null) => {
    const c = categories.find(x => x.id === id);
    if (!c) return "Sem categoria";
    const p = c.parent_id ? categories.find(x => x.id === c.parent_id) : null;
    return p ? `${p.name} › ${c.name}` : c.name;
  };
  const categoryOptions: CategoryOption[] = categories.filter(c => !c.parent_id && !c.archived_at)
    .map(c => ({ id: c.id, name: c.name, kind: c.kind, children: categories.filter(s => s.parent_id === c.id && !s.archived_at).map(s => ({ id: s.id, name: s.name })) }));
  const formProps = {
    today, categories: categoryOptions,
    accounts: accounts.filter(a => !a.archived_at || a.id === editing?.account_id).map(a => ({ id: a.id, label: `${a.institution_name} · ${a.name}` })),
    cards: cards.filter(c => !c.archived_at || c.id === editing?.card_id).map(c => ({ id: c.id, label: `${c.name}${c.last4 ? ` •••• ${c.last4}` : ""}` })),
  };

  return (
    <>
      <PageHeader title="Assinaturas" description="Serviços cobrados de tempos em tempos. A próxima cobrança é só uma previsão; a despesa nasce quando você registra a cobrança real.">
        <Link href="/assinaturas?novo=1" className={buttonVariants({ size: "sm" })}><Plus aria-hidden className="size-4" />Nova assinatura</Link>
      </PageHeader>

      {one("erro") && ERRORS[one("erro")] && <p role="alert" className="mb-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{ERRORS[one("erro")]}</p>}
      {one("ok") && <p role="status" className="mb-4 rounded-lg bg-brand/10 px-3 py-2 text-sm text-brand">Cobrança registrada como despesa e próxima data avançada.</p>}

      {showForm && (
        <Card className="mb-6">
          <h2 className="mb-4 font-medium">{editing ? `Editar “${editing.name}”` : "Nova assinatura"}</h2>
          <SubscriptionForm key={editing?.id ?? "nova"} {...formProps} subscription={editing && {
            id: editing.id, name: editing.name, amount: centsToInput(BigInt(editing.amount_cents)), period: editing.period,
            next_charge_date: editing.next_charge_date, means: editing.card_id ? `card:${editing.card_id}` : `account:${editing.account_id}`, category_id: editing.category_id,
          }} />
        </Card>
      )}

      {subs.length > 0 && (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <Card><p className="text-sm text-muted">Assinaturas ativas</p><p className="tabular mt-2 text-2xl font-semibold">{active.length}</p></Card>
            <Card>
              <p className="text-sm text-muted">Total mensal equivalente</p>
              <p className="tabular mt-2 text-2xl font-semibold">{formatBRL(monthlyTotal)}</p>
              <p className="mt-2 text-xs text-muted">Cada assinatura convertida para mês: custo por ano ÷ 12 (ex.: R$ 120,00 por ano = R$ 10,00/mês). Arredondado ao centavo.</p>
            </Card>
            <Card><p className="text-sm text-muted">Custo por ano</p><p className="tabular mt-2 text-2xl font-semibold">{formatBRL(yearlyTotal)}</p><p className="mt-2 text-xs text-muted">Valor × cobranças por ano, exato.</p></Card>
          </div>

          <ul className="grid gap-3">
            {subs.map(s => {
              const eq = monthlyEquivalent(BigInt(s.amount_cents), s.period);
              const overdue = s.status === "active" && s.next_charge_date < today;
              const history = charges.filter(c => c.subscription_id === s.id).slice(0, 3);
              return (
                <li key={s.id}>
                  <Card className={cn("grid gap-3", s.status !== "active" && "opacity-75")}>
                    <div className="flex flex-wrap items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{s.name} <Badge className={cn("ml-1", s.status === "active" ? "border-brand/40 text-brand" : "")}>{STATUS_LABEL[s.status]}</Badge></p>
                        <p className="text-xs text-muted">{means(s)} · {categoryName(s.category_id)}</p>
                      </div>
                      <div className="text-right">
                        <p className="tabular font-medium">{formatBRL(BigInt(s.amount_cents))} <span className="text-xs text-muted">{PERIOD_LABEL[s.period]}</span></p>
                        {s.period !== "monthly" && <p className="tabular text-xs text-muted">{eq.exact ? "" : "≈ "}{formatBRL(eq.cents)}/mês ({eq.formula})</p>}
                      </div>
                    </div>
                    {s.status === "active" && (
                      <p className={cn("text-sm", overdue ? "text-warning" : "text-muted")}>
                        Próxima cobrança prevista: <span className="tabular">{formatDateBR(s.next_charge_date)}</span>
                        {overdue && " — a data passou sem cobrança registrada. Registre-a ou ajuste a data."}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      {s.status === "active" && (
                        <details className="w-full rounded-lg border border-line p-3 sm:w-auto">
                          <summary className="cursor-pointer text-sm">Registrar cobrança</summary>
                          <form action={registerCharge} className="mt-3 flex flex-wrap items-end gap-2">
                            <input type="hidden" name="id" value={s.id} />
                            <label className="grid gap-1 text-xs text-muted">Data<Input type="date" name="date" required max={today} defaultValue={s.next_charge_date <= today ? s.next_charge_date : today} className="h-8" /></label>
                            <label className="grid gap-1 text-xs text-muted">Valor (R$)<Input name="amount" inputMode="decimal" required defaultValue={centsToInput(BigInt(s.amount_cents))} className="tabular h-8 w-28" /></label>
                            <Button size="sm">Registrar</Button>
                          </form>
                          <p className="mt-2 text-xs text-muted">Cria uma despesa em {means(s)} e avança a próxima cobrança.</p>
                        </details>
                      )}
                      <Link href={`/assinaturas?editar=${s.id}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>Editar</Link>
                      {(["active", "paused", "cancelled"] as const).filter(x => x !== s.status).map(x => (
                        <form key={x} action={setSubscriptionStatus}>
                          <input type="hidden" name="id" value={s.id} />
                          <input type="hidden" name="status" value={x} />
                          <Button variant={x === "cancelled" ? "danger" : "ghost"} size="sm">{x === "active" ? "Retomar" : x === "paused" ? "Pausar" : "Cancelar"}</Button>
                        </form>
                      ))}
                    </div>
                    {history.length > 0 && (
                      <p className="text-xs text-muted">Últimas cobranças: {history.map(h => `${formatDateBR(h.date)} ${formatBRL(BigInt(h.amount_cents))}`).join(" · ")}</p>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}
