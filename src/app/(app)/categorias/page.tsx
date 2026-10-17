import type { Metadata } from "next";
import Link from "next/link";
import { setCategoryArchived } from "@/app/actions/categories";
import { CategoryCreateForm, CategoryRenameForm } from "@/components/forms";
import { Badge, Button, buttonVariants, Card, PageHeader } from "@/components/ui";
import { KIND_LABEL } from "@/lib/catalog";
import { getCategories, type Category } from "@/lib/data";

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
  const { editar, arquivadas } = await props.searchParams;
  const showArchived = arquivadas === "1";
  const all = await getCategories();
  const parents = all.filter(c => !c.parent_id);
  const childrenOf = (id: string) => all.filter(c => c.parent_id === id && (showArchived || !c.archived_at));
  const visibleParents = parents.filter(p => showArchived || !p.archived_at);
  const archivedCount = all.filter(c => c.archived_at).length;
  const editHref = (id: string) => `/categorias?editar=${id}${showArchived ? "&arquivadas=1" : ""}`;

  return (
    <>
      <PageHeader title="Categorias" description="Por que o dinheiro entrou ou saiu. Você recebeu 15 categorias e 141 subcategorias prontas; renomeie, crie as suas ou arquive sem perder o histórico.">
        {archivedCount > 0 && (
          <Link href={showArchived ? "/categorias" : "/categorias?arquivadas=1"} className={buttonVariants({ variant: "secondary", size: "sm" })}>
            {showArchived ? "Ocultar arquivadas" : `Mostrar arquivadas (${archivedCount})`}
          </Link>
        )}
      </PageHeader>

      <Card className="mb-6">
        <h2 className="mb-4 font-medium">Nova categoria ou subcategoria</h2>
        <CategoryCreateForm parents={parents.filter(p => !p.archived_at).map(p => ({ id: p.id, name: p.name }))} />
      </Card>

      {visibleParents.length === 0 && (
        <Card><p className="text-sm text-muted">Nenhuma categoria encontrada. Se a conta acabou de ser criada, confira se a migration foi aplicada no Supabase.</p></Card>
      )}

      <p className="mb-3 text-xs text-muted">Valores por categoria aparecem quando as transações chegarem (Entrega 02). Cada lançamento será somado uma única vez, na sua subcategoria.</p>

      <ul className="grid gap-2">
        {visibleParents.map(p => {
          const kids = childrenOf(p.id);
          return (
            <li key={p.id}>
              <details className="group rounded-xl border border-line bg-surface open:bg-surface" open={editar === p.id || kids.some(k => k.id === editar)}>
                <summary className="flex cursor-pointer list-none items-center gap-3 rounded-xl px-4 py-3 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-brand">
                  <span aria-hidden className="text-muted transition-transform group-open:rotate-90">›</span>
                  <span className="flex-1 font-medium">{p.name}</span>
                  {p.archived_at && <Badge>Arquivada</Badge>}
                  <Badge>{KIND_LABEL[p.kind]}</Badge>
                  <span className="tabular text-xs text-muted">{kids.length} sub</span>
                </summary>
                <div className="border-t border-line px-4 py-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    {editar === p.id ? <CategoryRenameForm id={p.id} name={p.name} /> : <span className="text-xs text-muted">Categoria principal</span>}
                    {editar !== p.id && <Actions c={p} editHref={editHref(p.id)} />}
                  </div>
                  <ul className="divide-y divide-line">
                    {kids.map(k => (
                      <li key={k.id} className="flex flex-wrap items-center gap-2 py-2 pl-4">
                        {editar === k.id ? (
                          <CategoryRenameForm id={k.id} name={k.name} />
                        ) : (
                          <>
                            <span className="flex-1 text-sm">{k.name} {k.archived_at && <Badge className="ml-1">Arquivada</Badge>}</span>
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
