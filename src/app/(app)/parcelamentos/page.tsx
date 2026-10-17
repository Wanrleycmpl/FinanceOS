import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { cancelPlan, setInstallmentPaid } from "@/app/actions/installments";
import { InstallmentForm } from "@/components/installment-form";
import type { CategoryOption } from "@/components/transaction-form";
import { Badge, Button, buttonVariants, Card, PageHeader } from "@/components/ui";
import { describeStatement } from "@/lib/cards";
import { getAccounts, getCards, getCardStatements, getCategories, getInstallmentPlans } from "@/lib/data";
import { formatDateBR, todayInBrazil } from "@/lib/dates";
import { INSTALLMENT_STATE_LABEL, summarizePlan, type InstallmentState } from "@/lib/installments";
import { formatBRL } from "@/lib/money";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Parcelamentos" };

const STATE_TONE: Record<InstallmentState, string> = {
  paid: "border-brand/40 text-brand",
  due: "border-danger/50 text-danger",
  upcoming: "",
  on_statement: "border-warning/40 text-warning",
  future: "",
  cancelled: "border-line text-muted line-through",
};
const ERRORS: Record<string, string> = {
  futura: "Só dá para confirmar o pagamento de parcelas com data até hoje. Se pagou adiantado, edite a data da parcela em Transações.",
  falha: "Não foi possível concluir. Tente de novo.",
};

export default async function Page(props: PageProps<"/parcelamentos">) {
  const params = await props.searchParams;
  const one = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : "");
  const today = todayInBrazil();
  const [{ plans, installments, refundedByPlan }, accounts, cards, categories] = await Promise.all([getInstallmentPlans(), getAccounts(), getCards(), getCategories()]);

  // Card installments are "paid" when their statement is fully paid.
  const cardIds = [...new Set(plans.map(p => p.card_id).filter(Boolean))] as string[];
  const paidStatements = new Map<string, Set<string>>();
  await Promise.all(cardIds.map(async id => {
    const card = cards.find(c => c.id === id);
    if (!card) return;
    const rows = await getCardStatements(id);
    paidStatements.set(id, new Set(rows.map(r => describeStatement(r, card, today)).filter(s => s.status === "paid" || s.status === "credit").map(s => s.month)));
  }));
  const summaries = plans.map(p => ({ plan: p, s: summarizePlan(p, installments, refundedByPlan.get(p.id) ?? 0n, today, paidStatements.get(p.card_id ?? "") ?? new Set()) }));
  const selected = summaries.find(x => x.plan.id === one("plano")) ?? summaries.find(x => x.s.status === "active") ?? summaries[0];
  const meansLabel = (p: { account_id: string | null; card_id: string | null }) => {
    if (p.card_id) { const c = cards.find(x => x.id === p.card_id); return c ? `Cartão ${c.name}${c.last4 ? ` •••• ${c.last4}` : ""}` : "Cartão"; }
    const a = accounts.find(x => x.id === p.account_id); return a ? `${a.institution_name} · ${a.name}` : "Conta";
  };
  const active = summaries.filter(x => x.s.status === "active");
  const remainingTotal = active.reduce((sum, x) => sum + x.s.remainingCents, 0n);
  const showForm = one("novo") === "1" || plans.length === 0;
  const categoryOptions: CategoryOption[] = categories.filter(c => !c.parent_id && !c.archived_at)
    .map(c => ({ id: c.id, name: c.name, kind: c.kind, children: categories.filter(s => s.parent_id === c.id && !s.archived_at).map(s => ({ id: s.id, name: s.name })) }));

  return (
    <>
      <PageHeader title="Parcelamentos" description="Cada parcela é um lançamento no seu mês; a compra original não é somada de novo. O total sempre fecha em centavos.">
        <Link href="/parcelamentos?novo=1" className={buttonVariants({ size: "sm" })}><Plus aria-hidden className="size-4" />Novo parcelamento</Link>
      </PageHeader>

      {one("erro") && ERRORS[one("erro")] && <p role="alert" className="mb-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{ERRORS[one("erro")]}</p>}

      {showForm && (
        <Card className="mb-6">
          <h2 className="mb-4 font-medium">Novo parcelamento</h2>
          <InstallmentForm
            today={today}
            categories={categoryOptions}
            accounts={accounts.filter(a => !a.archived_at).map(a => ({ id: a.id, label: `${a.institution_name} · ${a.name}` }))}
            cards={cards.filter(c => !c.archived_at).map(c => ({ id: c.id, label: `${c.name}${c.last4 ? ` •••• ${c.last4}` : ""}` }))}
          />
        </Card>
      )}

      {summaries.length > 0 && (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2">
            <Card><p className="text-sm text-muted">Parcelamentos ativos</p><p className="tabular mt-2 text-2xl font-semibold">{active.length}</p></Card>
            <Card><p className="text-sm text-muted">Restante a pagar</p><p className="tabular mt-2 text-2xl font-semibold">{formatBRL(remainingTotal)}</p><p className="mt-2 text-xs text-muted">Parcelas ainda não pagas dos parcelamentos ativos (no cartão, até a fatura delas ser paga).</p></Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
            <ul className="grid content-start gap-3">
              {summaries.map(({ plan, s }) => (
                <li key={plan.id}>
                  <Link href={`/parcelamentos?plano=${plan.id}`} aria-current={selected?.plan.id === plan.id ? "true" : undefined}
                    className={cn("grid gap-2 rounded-xl border bg-surface p-4 hover:bg-surface-2", selected?.plan.id === plan.id ? "border-brand/60" : "border-line")}>
                    <span className="flex items-center gap-2">
                      <span className="flex-1 font-medium">{plan.description}</span>
                      {s.status === "done" && <Badge className="border-brand/40 text-brand">Quitado</Badge>}
                      {s.status === "cancelled" && <Badge>Cancelado</Badge>}
                      {s.dueCount > 0 && <Badge className="border-danger/50 text-danger">{s.dueCount} a confirmar</Badge>}
                    </span>
                    <span className="text-xs text-muted">{meansLabel(plan)} · {plan.installments_count}× · total {formatBRL(s.total)}</span>
                    <span className="h-2 overflow-hidden rounded-full bg-surface-3" role="img" aria-label={`${s.paidCount} de ${s.count} parcelas pagas`}>
                      <span className="block h-full rounded-full bg-brand" style={{ width: `${s.progress}%` }} />
                    </span>
                    <span className="tabular flex justify-between text-xs">
                      <span className="text-muted">{s.paidCount}/{s.count} pagas</span>
                      <span>Restante {formatBRL(s.remainingCents)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>

            {selected && (
              <Card className="grid content-start gap-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-medium">{selected.plan.description}</h2>
                    <p className="text-xs text-muted">{meansLabel(selected.plan)} · 1ª parcela em {formatDateBR(selected.plan.first_date)}</p>
                  </div>
                  <Link href={`/transacoes?busca=${encodeURIComponent(selected.plan.description)}&mes=${selected.plan.first_date.slice(0, 7)}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>Ver em Transações</Link>
                </div>
                <dl className="tabular grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <div><dt className="text-xs text-muted">Total</dt><dd>{formatBRL(selected.s.total)}</dd></div>
                  <div><dt className="text-xs text-muted">Pago</dt><dd>{formatBRL(selected.s.paidCents)} <span className="text-xs text-muted">({selected.s.paidCount}/{selected.s.count})</span></dd></div>
                  <div><dt className="text-xs text-muted">Restante</dt><dd className="font-semibold">{formatBRL(selected.s.remainingCents)}</dd></div>
                  <div><dt className="text-xs text-muted">{selected.s.status === "cancelled" ? "Cancelado / estornado" : "Progresso"}</dt><dd>{selected.s.status === "cancelled" ? `${formatBRL(selected.s.cancelledCents)} / ${formatBRL(selected.s.refunded)}` : `${selected.s.progress.toLocaleString("pt-BR")}%`}</dd></div>
                </dl>
                {selected.s.isCard && <p className="text-xs text-muted">No cartão, a parcela é cobrada na fatura do mês e fica paga quando essa fatura é paga (em Cartões).</p>}

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-muted"><tr><th className="py-2 pr-3 font-medium">Parcela</th><th className="py-2 pr-3 font-medium">Data</th>{selected.s.isCard && <th className="py-2 pr-3 font-medium">Fatura</th>}<th className="py-2 pr-3 text-right font-medium">Valor</th><th className="py-2 pr-3 font-medium">Situação</th><th className="py-2"><span className="sr-only">Ação</span></th></tr></thead>
                    <tbody className="divide-y divide-line">
                      {selected.s.items.map(i => (
                        <tr key={i.id}>
                          <td className="tabular py-2 pr-3">{i.installment_number}/{selected.s.count}</td>
                          <td className="tabular py-2 pr-3 text-muted">{formatDateBR(i.date)}</td>
                          {selected.s.isCard && <td className="tabular py-2 pr-3 text-muted">{i.statement_month ? `${i.statement_month.slice(5, 7)}/${i.statement_month.slice(0, 4)}` : "—"}</td>}
                          <td className="tabular py-2 pr-3 text-right">{formatBRL(i.cents)}</td>
                          <td className="py-2 pr-3"><Badge className={STATE_TONE[i.state]}>{INSTALLMENT_STATE_LABEL[i.state]}</Badge></td>
                          <td className="py-1 text-right">
                            {!selected.s.isCard && i.state !== "cancelled" && (i.state === "paid" || i.date <= today) && (
                              <form action={setInstallmentPaid}>
                                <input type="hidden" name="id" value={i.id} />
                                <input type="hidden" name="plan" value={selected.plan.id} />
                                <input type="hidden" name="paid" value={i.state === "paid" ? "0" : "1"} />
                                <Button variant={i.state === "paid" ? "ghost" : "secondary"} size="sm">{i.state === "paid" ? "Desfazer" : "Confirmar pagamento"}</Button>
                              </form>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="tabular text-xs text-muted">Soma das parcelas: {formatBRL(selected.s.items.reduce((sum, i) => sum + i.cents, 0n))} = total {formatBRL(selected.s.total)}.</p>

                {selected.s.status === "active" && (
                  <details className="rounded-lg border border-line p-3">
                    <summary className="cursor-pointer text-sm text-danger">Cancelar parcelamento…</summary>
                    <div className="mt-3 grid gap-3 text-sm text-muted">
                      <p>Parcelas {selected.s.isCard ? "futuras (ainda não cobradas)" : "pendentes"} vão para a lixeira. As já {selected.s.isCard ? "cobradas" : "pagas"} continuam registradas.</p>
                      <p>Se a loja devolveu o dinheiro, escolha “Cancelar e estornar”: cria um estorno para cada parcela já {selected.s.isCard ? "cobrada" : "paga"} (no mesmo {selected.s.isCard ? "cartão" : "meio"}), sem contar nada duas vezes.</p>
                      <div className="flex flex-wrap gap-2">
                        <form action={cancelPlan}><input type="hidden" name="plan" value={selected.plan.id} /><input type="hidden" name="refund" value="0" /><Button variant="danger" size="sm">Cancelar parcelas restantes</Button></form>
                        <form action={cancelPlan}><input type="hidden" name="plan" value={selected.plan.id} /><input type="hidden" name="refund" value="1" /><Button variant="danger" size="sm">Cancelar e estornar</Button></form>
                      </div>
                    </div>
                  </details>
                )}
              </Card>
            )}
          </div>
        </>
      )}
    </>
  );
}
