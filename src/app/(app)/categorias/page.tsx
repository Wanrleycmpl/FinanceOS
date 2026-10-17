import type { Metadata } from "next";
import Link from "next/link";
import { setCategoryArchived } from "@/app/actions/categories";
import { CategoryDonut } from "@/components/charts/category-donut";
import { CategoryCreateForm, CategoryRenameForm } from "@/components/forms";
import { Badge, Button, buttonVariants, Card, PageHeader, Select } from "@/components/ui";
import { KIND_LABEL } from "@/lib/catalog";
import { rankCategories } from "@/lib/dashboard";
import { getAccounts, getCategories, getCategoryTotals, type Category } from "@/lib/data";
import { todayInBrazil } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { monthLabel, parseFilters } from "@/lib/transactions";

export const metadata: Metadata = { title: "Categorias" };

function Actions({ c, editHref }: { c: Category; editHref: string }) {
  return (
    <div className="flex shrink-0 gap-1">
      {!c.archived_at && <Link href={editHref} className={buttonVariants({ variant: "ghost", size: "sm" })}>Renomear</Link>}
      <form action={setCategoryArchived}>
        <input type="hidden" name="id" value={c.id} />
        <input type="hidden" name="archive" value={c.archived_at ? "0" : "1"} />
        <Button variant="ghost" size="sm">{c.archived_at ? "Restaurar" : "Arquivar"}</Button>
      </form>
    </div>
  );
}

export default async function Page(props: PageProps<"/categorias">) {
  const params = await props.searchParams;
  const { editar, arquivadas } = params;
  const f = parseFilters(params, todayInBrazil());
  const showArchived = arquivadas === "1";
  const [all, accounts, totals] = await Promise.all([getCategories(), getAccounts(), getCategoryTotals(f.month, f.account)]);
  const parents = all.filter(c => !c.parent_id);
  const childrenOf = (id: string) => all.filter(c => c.parent_id === id && (showArchived || !c.archived_at));
  const visibleParents = parents.filter(p => showArchived || !p.archived_at);
  const archivedCount = all.filter(c => c.archived_at).length;
  const keep = `mes=${f.month}${f.account ? `&conta=${f.account}` : ""}`;
  const editHref = (id: string) => `/categorias?${keep}&editar=${id}${showArchived ? "&arquivadas=1" : ""}`;

  const expenses = rankCategories(totals, all, "expense");
  const income = rankCategories(totals, all, "income");
  // Value of each leaf (its own transactions only) and of each main category (sum of its leaves).
  const leaf = new Map<string, { expense: bigint; income: bigint }>();
  for (const t of totals) {
    if (!t.category_id) continue;
    const v = leaf.get(t.category_id) ?? { expense: 0n, income: 0n };
    v[t.side] += BigInt(t.total_cents);
    leaf.set(t.category_id, v);
  }
  const parentTotal = (id: string, side: "expense" | "income") => (side === "expense" ? expenses : income).slices.find(s => s.id === id)?.cents ?? 0n;
  const share = (cents: bigint, side: "expense" | "income") => {
    const total = side === "expense" ? expenses.total : income.total;
    return total > 0n && cents > 0n ? `${(Number((cents * 1000n) / total) / 10).toLocaleString("pt-BR")}%` : null;
  };
  const values = (expense: bigint, inc: bigint) => (
    <span className="tabular flex shrink-0 flex-col items-end text-xs">
      {expense !== 0n && <span>{formatBRL(expense)}{share(expense, "expense") && <span className="text-muted"> · {share(expense, "expense")}</span>}</span>}
      {inc !== 0n && <span className="text-brand">+{formatBRL(inc)}{share(inc, "income") && <span className="text-muted"> · {share(inc, "income")}</span>}</span>}
    </span>
  );
  const uncategorized = totals.filter(t => !t.category_id);

  return (
    <>
      <PageHeader title="Categorias" description="Por que o dinheiro entrou ou saiu. Valores do mês: cada lançamento soma uma vez, na sua subcategoria; a principal mostra a soma das suas subcategorias.">
        <form action="/categorias" className="flex flex-wrap items-end gap-2">
          <label className="grid gap-1 text-xs text-muted">Mês<input type="month" name="mes" defaultValue={f.month} className="h-8 rounded-lg border border-line bg-surface-2 px-2 text-sm text-ink" /></label>
          <label className="grid gap-1 text-xs text-muted">Conta
            <Select name="conta" defaultValue={f.account ?? ""} className="h-8 w-44">
              <option value="">Todas as contas</option>
              {accounts.filter(a => !a.archived_at).map(a => <option key={a.id} value={a.id}>{a.institution_name} · {a.name}</option>)}
            </Select>
          </label>
          {showArchived && <input type="hidden" name="arquivadas" value="1" />}
          <button className={buttonVariants({ variant: "secondary", size: "sm" })}>Ver</button>
        </form>
      </PageHeader>

      <div className="mb-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <h2 className="mb-4 font-medium">Despesas por categoria · {monthLabel(f.month)}</h2>
          {expenses.slices.length === 0
            ? <p className="text-sm text-muted">Sem despesas liquidadas neste mês.</p>
            : <CategoryDonut total={expenses.total.toString()} slices={expenses.slices.map(s => ({ name: s.name, cents: s.cents.toString(), share: s.share }))} />}
        </Card>
        <Card>
          <h2 className="mb-4 font-medium">Receitas · {monthLabel(f.month)}</h2>
          {income.slices.length === 0 ? <p className="text-sm text-muted">Sem receitas liquidadas neste mês.</p> : (
            <ul className="grid gap-2 text-sm">
              {income.slices.map(s => (
                <li key={s.id ?? "none"} className="flex items-center justify-between gap-3">
                  <Link className="truncate hover:underline" href={`/transacoes?${keep}${s.id ? `&categoria=${s.id}` : ""}&natureza=income`}>{s.name}</Link>
                  <span className="tabular text-brand">+{formatBRL(s.cents)} <span className="text-muted">· {s.share.toLocaleString("pt-BR")}%</span></span>
                </li>
              ))}
              <li className="flex justify-between border-t border-line pt-2 font-medium"><span>Total</span><span className="tabular">+{formatBRL(income.total)}</span></li>
            </ul>
          )}
        </Card>
      </div>

      <Card className="mb-6">
        <h2 className="mb-4 font-medium">Nova categoria ou subcategoria</h2>
        <CategoryCreateForm parents={parents.filter(p => !p.archived_at).map(p => ({ id: p.id, name: p.name }))} />
      </Card>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">Despesas já descontam estornos. Transferências e movimentações financeiras não entram.</p>
        {archivedCount > 0 && (
          <Link href={showArchived ? `/categorias?${keep}` : `/categorias?${keep}&arquivadas=1`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
            {showArchived ? "Ocultar arquivadas" : `Mostrar arquivadas (${archivedCount})`}
          </Link>
        )}
      </div>

      {visibleParents.length === 0 && (
        <Card><p className="text-sm text-muted">Nenhuma categoria encontrada. Confira se as migrations foram aplicadas no Supabase.</p></Card>
      )}

      <ul className="grid gap-2">
        {uncategorized.length > 0 && (
          <li className="flex items-center gap-3 rounded-xl border border-dashed border-line px-4 py-3">
            <span className="flex-1 text-sm">Sem categoria <span className="text-xs text-muted">(ex.: importados por CSV)</span></span>
            {values(uncategorized.filter(t => t.side === "expense").reduce((s, t) => s + BigInt(t.total_cents), 0n), uncategorized.filter(t => t.side === "income").reduce((s, t) => s + BigInt(t.total_cents), 0n))}
          </li>
        )}
        {visibleParents.map(p => {
          const kids = childrenOf(p.id);
          return (
            <li key={p.id}>
              <details className="group rounded-xl border border-line bg-surface" open={editar === p.id || kids.some(k => k.id === editar)}>
                <summary className="flex cursor-pointer list-none items-center gap-3 rounded-xl px-4 py-3 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-brand">
                  <span aria-hidden className="text-muted transition-transform group-open:rotate-90">›</span>
                  <span className="flex-1 font-medium">{p.name}</span>
                  {p.archived_at && <Badge>Arquivada</Badge>}
                  <Badge className="hidden sm:inline-flex">{KIND_LABEL[p.kind]}</Badge>
                  {values(parentTotal(p.id, "expense"), parentTotal(p.id, "income"))}
                </summary>
                <div className="border-t border-line px-4 py-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    {editar === p.id ? <CategoryRenameForm id={p.id} name={p.name} /> : (
                      <Link className="text-xs text-brand hover:underline" href={`/transacoes?${keep}&categoria=${p.id}`}>Ver transações de {p.name}</Link>
                    )}
                    {editar !== p.id && <Actions c={p} editHref={editHref(p.id)} />}
                  </div>
                  <ul className="divide-y divide-line">
                    {leaf.get(p.id) && (
                      <li className="flex items-center gap-2 py-2 pl-4 text-sm text-muted">
                        <span className="flex-1">Lançados em “{p.name}” sem subcategoria</span>
                        {values(leaf.get(p.id)!.expense, leaf.get(p.id)!.income)}
                      </li>
                    )}
                    {kids.map(k => (
                      <li key={k.id} className="flex flex-wrap items-center gap-2 py-2 pl-4">
                        {editar === k.id ? (
                          <CategoryRenameForm id={k.id} name={k.name} />
                        ) : (
                          <>
                            <Link href={`/transacoes?${keep}&categoria=${k.id}`} className="flex-1 text-sm hover:underline">{k.name} {k.archived_at && <Badge className="ml-1">Arquivada</Badge>}</Link>
                            {leaf.get(k.id) && values(leaf.get(k.id)!.expense, leaf.get(k.id)!.income)}
                            <Actions c={k} editHref={editHref(k.id)} />
                          </>
                        )}
                      </li>
                    ))}
                    {kids.length === 0 && <li className="py-2 pl-4 text-sm text-muted">Sem subcategorias.</li>}
                  </ul>
                </div>
              </details>
            </li>
          );
        })}
      </ul>
    </>
  );
}
