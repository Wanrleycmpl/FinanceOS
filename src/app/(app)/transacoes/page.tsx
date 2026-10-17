import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftRight, ChevronLeft, ChevronRight, Download, Plus } from "lucide-react";
import { setTransactionFlag } from "@/app/actions/transactions";
import { TransactionForm, type CategoryOption } from "@/components/transaction-form";
import { Badge, Button, buttonVariants, Card, PageHeader, Select, Input } from "@/components/ui";
import { getAccounts, getCategories, getRefundedTotal, getSummary, getTransaction, listTransactions, type Account, type Category, type Transaction } from "@/lib/data";
import { formatDateBR, todayInBrazil } from "@/lib/dates";
import { centsFromText, centsToInput, formatBRL } from "@/lib/money";
import { filtersToQuery, monthLabel, NATURE_LABEL, PAGE_SIZE, parseFilters, shiftMonth, STATUS_LABEL, type Filters } from "@/lib/transactions";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Transações" };

const ERRORS: Record<string, string> = {
  estornos: "Essa compra tem estornos ativos. Mande os estornos para a lixeira antes de mandar a compra.",
  falha: "Não foi possível alterar o lançamento. Tente de novo.",
};

function categoryLabel(categories: Category[], id: string | null) {
  if (!id) return "Sem categoria";
  const c = categories.find(x => x.id === id);
  if (!c) return "—";
  const parent = c.parent_id ? categories.find(x => x.id === c.parent_id) : null;
  return parent ? `${parent.name} › ${c.name}` : c.name;
}
const accountLabel = (a: Account) => `${a.institution_name} · ${a.name}`;

function Amount({ t }: { t: Transaction }) {
  const cents = centsFromText(t.amount_cents);
  if (t.nature === "transfer") return <span className="tabular text-muted">{formatBRL(cents)}</span>;
  const positive = t.direction === "in";
  return <span className={cn("tabular font-medium", positive ? "text-brand" : "text-ink")}>{positive ? "+" : "−"}{formatBRL(cents)}</span>;
}

function Flags({ t }: { t: Transaction }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {t.nature !== "expense" && t.nature !== "income" && <Badge>{NATURE_LABEL[t.nature]}</Badge>}
      {t.status === "pending" && <Badge className="border-warning/40 text-warning">Pendente</Badge>}
      {t.hidden && <Badge>Oculto</Badge>}
      {t.excluded_from_reports && <Badge>Fora dos relatórios</Badge>}
      {t.trashed_at && <Badge className="border-danger/40 text-danger">Lixeira</Badge>}
    </span>
  );
}

function RowActions({ t, back, query }: { t: Transaction; back: string; query: string }) {
  const flag = (name: string, value: boolean, label: string) => (
    <form action={setTransactionFlag}>
      <input type="hidden" name="id" value={t.id} />
      <input type="hidden" name="flag" value={name} />
      <input type="hidden" name="value" value={value ? "1" : "0"} />
      <input type="hidden" name="back" value={back} />
      <Button variant="ghost" size="sm">{label}</Button>
    </form>
  );
  if (t.trashed_at) return <div className="flex flex-wrap justify-end gap-1">{flag("trash", false, "Restaurar")}</div>;
  return (
    <div className="flex flex-wrap justify-end gap-1">
      <Link href={`/transacoes?${query}&editar=${t.id}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>Editar</Link>
      {t.nature === "expense" && t.status === "settled" && <Link href={`/transacoes?${query}&estornar=${t.id}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>Estornar</Link>}
      {flag("hidden", !t.hidden, t.hidden ? "Mostrar" : "Ocultar")}
      {flag("excluded", !t.excluded_from_reports, t.excluded_from_reports ? "Incluir nos relatórios" : "Excluir dos relatórios")}
      {flag("trash", true, "Lixeira")}
    </div>
  );
}

function Indicator({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: "good" | "bad" }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className={cn("tabular mt-1 text-lg font-semibold", tone === "good" && "text-brand", tone === "bad" && "text-danger")}>{value}</p>
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
    </Card>
  );
}

export default async function Page(props: PageProps<"/transacoes">) {
  const params = await props.searchParams;
  const today = todayInBrazil();
  const f: Filters = parseFilters(params, today);
  const query = filtersToQuery(f, { page: f.page });
  const back = `/transacoes?${query}`;
  const one = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : "");

  const [accounts, categories] = await Promise.all([getAccounts(), getCategories()]);
  const [{ rows, total }, summary, editing, refundOrigin] = await Promise.all([
    listTransactions(f, categories),
    getSummary(f),
    one("editar") ? getTransaction(one("editar")) : null,
    one("estornar") ? getTransaction(one("estornar")) : null,
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const byId = new Map(accounts.map(a => [a.id, a]));

  // Form options: active accounts/categories, plus the ones already used by the transaction being edited.
  const keep = new Set([editing?.account_id, editing?.to_account_id, editing?.category_id].filter(Boolean));
  const accountOptions = accounts.filter(a => !a.archived_at || keep.has(a.id)).map(a => ({ id: a.id, label: accountLabel(a) }));
  const keepParent = categories.find(c => c.id === editing?.category_id)?.parent_id;
  const categoryOptions: CategoryOption[] = categories
    .filter(c => !c.parent_id && (!c.archived_at || keep.has(c.id) || c.id === keepParent))
    .map(c => ({ id: c.id, name: c.name, kind: c.kind, children: categories.filter(s => s.parent_id === c.id && (!s.archived_at || keep.has(s.id))).map(s => ({ id: s.id, name: s.name })) }));

  let refund: { id: string; description: string; account_id: string; remaining: string } | undefined;
  if (refundOrigin && refundOrigin.nature === "expense") {
    const used = await getRefundedTotal(refundOrigin.id); // the database enforces the same limit on save
    refund = { id: refundOrigin.id, description: refundOrigin.description, account_id: refundOrigin.account_id, remaining: formatBRL(centsFromText(refundOrigin.amount_cents) - used) };
  }
  const showForm = one("novo") === "1" || Boolean(editing) || Boolean(refund);
  const hasData = summary.operationalCount > 0;
  const activeCategory = f.category ? categoryLabel(categories, f.category) : null;

  return (
    <>
      <PageHeader title="Transações" description="Receitas, despesas, transferências entre suas contas e estornos. Os indicadores seguem os filtros abaixo.">
        <div className="flex flex-wrap gap-2">
          <a href={`/transacoes/exportar?${filtersToQuery(f)}`} className={buttonVariants({ variant: "secondary", size: "sm" })}><Download aria-hidden className="size-4" />Exportar CSV</a>
          <Link href={`/transacoes?${query}&novo=1`} className={buttonVariants({ size: "sm" })}><Plus aria-hidden className="size-4" />Novo lançamento</Link>
        </div>
      </PageHeader>

      {one("erro") && ERRORS[one("erro")] && <p role="alert" className="mb-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{ERRORS[one("erro")]}</p>}

      {showForm && (
        <Card className="mb-6">
          <h2 className="mb-4 font-medium">{editing ? "Editar lançamento" : refund ? "Registrar estorno / cashback" : "Novo lançamento"}</h2>
          <TransactionForm
            key={editing?.id ?? refund?.id ?? "novo"}
            accounts={accountOptions}
            categories={categoryOptions}
            today={today}
            back={back}
            refund={refund}
            defaults={editing ? {
              id: editing.id, nature: editing.nature, direction: editing.direction, account_id: editing.account_id, to_account_id: editing.to_account_id,
              category_id: editing.category_id, description: editing.description, amount: centsToInput(centsFromText(editing.amount_cents)), date: editing.date, status: editing.status,
            } : undefined}
          />
        </Card>
      )}

      {/* Filters: a plain GET form, so every filter lives in the URL and links keep it. */}
      <Card className="mb-4 p-4">
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" action="/transacoes">
          <div className="flex items-end gap-1 lg:col-span-1">
            <Link aria-label="Mês anterior" href={`/transacoes?${filtersToQuery(f, { month: shiftMonth(f.month, -1) })}`} className={buttonVariants({ variant: "ghost", size: "sm" })}><ChevronLeft aria-hidden className="size-4" /></Link>
            <label className="grid flex-1 gap-1 text-xs text-muted">Mês<Input type="month" name="mes" defaultValue={f.month} /></label>
            <Link aria-label="Próximo mês" href={`/transacoes?${filtersToQuery(f, { month: shiftMonth(f.month, 1) })}`} className={buttonVariants({ variant: "ghost", size: "sm" })}><ChevronRight aria-hidden className="size-4" /></Link>
          </div>
          <label className="grid gap-1 text-xs text-muted">Busca<Input name="busca" defaultValue={f.q ?? ""} placeholder="Descrição" /></label>
          <label className="grid gap-1 text-xs text-muted">Conta
            <Select name="conta" defaultValue={f.account ?? ""}>
              <option value="">Todas as contas</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{accountLabel(a)}{a.archived_at ? " (arquivada)" : ""}</option>)}
            </Select>
          </label>
          <label className="grid gap-1 text-xs text-muted">Categoria
            <Select name="categoria" defaultValue={f.category ?? ""}>
              <option value="">Todas as categorias</option>
              {categories.filter(c => !c.parent_id).map(c => (
                <optgroup key={c.id} label={c.name}>
                  <option value={c.id}>{c.name} (inclui subcategorias)</option>
                  {categories.filter(s => s.parent_id === c.id).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </optgroup>
              ))}
            </Select>
          </label>
          <label className="grid gap-1 text-xs text-muted">Tipo
            <Select name="natureza" defaultValue={f.nature ?? ""}>
              <option value="">Todos os tipos</option>
              {Object.entries(NATURE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </label>
          <label className="grid gap-1 text-xs text-muted">Situação
            <Select name="status" defaultValue={f.status ?? ""}>
              <option value="">Todas</option>
              {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </label>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="inline-flex items-center gap-2"><input type="checkbox" name="ocultas" value="1" defaultChecked={f.showHidden} className="accent-brand" />Mostrar ocultos</label>
            <label className="inline-flex items-center gap-2"><input type="checkbox" name="lixeira" value="1" defaultChecked={f.trash} className="accent-brand" />Ver lixeira</label>
          </div>
          <div className="flex items-end gap-2">
            <Button size="sm">Filtrar</Button>
            <Link href={`/transacoes?mes=${f.month}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>Limpar</Link>
          </div>
        </form>
      </Card>

      <p className="mb-3 text-sm text-muted">
        {monthLabel(f.month)}{activeCategory && ` · ${activeCategory}`}{f.account && byId.get(f.account) && ` · ${accountLabel(byId.get(f.account)!)}`}
      </p>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Indicator label={f.trash ? "Na lixeira" : "Lançamentos na lista"} value={String(total)} />
        <Indicator label="Receitas" value={hasData ? formatBRL(summary.income) : "—"} />
        <Indicator label="Despesas líquidas" value={hasData ? formatBRL(summary.netExpense) : "—"} note={summary.refunds > 0n ? `${formatBRL(summary.expense)} − estornos ${formatBRL(summary.refunds)}` : undefined} />
        <Indicator label="Resultado" value={hasData ? formatBRL(summary.result) : "—"} tone={hasData ? (summary.result >= 0n ? "good" : "bad") : undefined} note="Receitas − despesas líquidas. Não é o saldo da conta." />
        <Indicator label="Pendentes" value={`+${formatBRL(summary.pendingIncome)} / −${formatBRL(summary.pendingExpense)}`} note="Previstos; fora do resultado e do saldo." />
      </div>
      {!hasData && <p className="-mt-3 mb-4 text-xs text-muted">Sem receitas ou despesas liquidadas neste filtro — mostramos “—” em vez de zero. Transferências e movimentações financeiras nunca entram nesses totais.</p>}
      {f.trash && <p className="-mt-3 mb-4 text-xs text-muted">Itens na lixeira não entram em nenhum indicador nem no saldo. Restaure para voltarem.</p>}

      {rows.length === 0 ? (
        <Card><p className="text-sm text-muted">{f.trash ? "A lixeira está vazia neste filtro." : "Nenhum lançamento neste filtro."} <Link className="text-brand hover:underline" href={`/transacoes?${query}&novo=1`}>Adicionar lançamento</Link></p></Card>
      ) : (
        <Card className="p-0">
          {/* Desktop: table */}
          <table className="hidden w-full text-sm md:table">
            <thead className="border-b border-line text-left text-xs text-muted">
              <tr><th className="px-4 py-3 font-medium">Data</th><th className="px-4 py-3 font-medium">Descrição</th><th className="px-4 py-3 font-medium">Categoria</th><th className="px-4 py-3 font-medium">Conta</th><th className="px-4 py-3 text-right font-medium">Valor</th><th className="sr-only px-4 py-3">Ações</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map(t => (
                <tr key={t.id} className={cn("align-top", (t.hidden || t.trashed_at) && "opacity-70")}>
                  <td className="tabular whitespace-nowrap px-4 py-3 text-muted">{formatDateBR(t.date)}</td>
                  <td className="px-4 py-3"><p>{t.description}</p><Flags t={t} /></td>
                  <td className="px-4 py-3 text-muted">{t.nature === "transfer" && !t.category_id ? "—" : categoryLabel(categories, t.category_id)}</td>
                  <td className="px-4 py-3 text-muted">
                    {t.nature === "transfer"
                      ? <span className="inline-flex items-center gap-1">{byId.get(t.account_id)?.name}<ArrowLeftRight aria-label="para" className="size-3" />{byId.get(t.to_account_id!)?.name}</span>
                      : byId.get(t.account_id) && accountLabel(byId.get(t.account_id)!)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right"><Amount t={t} /></td>
                  <td className="px-2 py-2"><RowActions t={t} back={back} query={query} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Mobile: same data as cards */}
          <ul className="divide-y divide-line md:hidden">
            {rows.map(t => (
              <li key={t.id} className={cn("grid gap-1 px-4 py-3", (t.hidden || t.trashed_at) && "opacity-70")}>
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium">{t.description}</p>
                  <Amount t={t} />
                </div>
                <p className="text-xs text-muted">
                  {formatDateBR(t.date)} · {t.nature === "transfer" ? `${byId.get(t.account_id)?.name} → ${byId.get(t.to_account_id!)?.name}` : byId.get(t.account_id) && accountLabel(byId.get(t.account_id)!)}
                  {(t.category_id || t.nature !== "transfer") && ` · ${categoryLabel(categories, t.category_id)}`}
                </p>
                <Flags t={t} />
                <RowActions t={t} back={back} query={query} />
              </li>
            ))}
          </ul>
          {pages > 1 && (
            <nav aria-label="Páginas" className="flex items-center justify-between border-t border-line px-4 py-3 text-sm">
              {f.page > 1 ? <Link href={`/transacoes?${filtersToQuery(f, { page: f.page - 1 })}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>Anterior</Link> : <span />}
              <span className="text-muted">Página {f.page} de {pages}</span>
              {f.page < pages ? <Link href={`/transacoes?${filtersToQuery(f, { page: f.page + 1 })}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>Próxima</Link> : <span />}
            </nav>
          )}
        </Card>
      )}
    </>
  );
}
