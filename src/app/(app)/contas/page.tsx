import type { Metadata } from "next";
import Link from "next/link";
import { setAccountArchived } from "@/app/actions/accounts";
import { AccountForm } from "@/components/forms";
import { Badge, Button, buttonVariants, Card, PageHeader } from "@/components/ui";
import { ACCOUNT_KIND_LABEL, getAccounts, getBalances } from "@/lib/data";
import { formatDateBR, todayInBrazil } from "@/lib/dates";
import { centsFromText, centsToInput, formatBRL } from "@/lib/money";

export const metadata: Metadata = { title: "Contas" };

export default async function Page(props: PageProps<"/contas">) {
  const { editar, arquivadas } = await props.searchParams;
  const showArchived = arquivadas === "1";
  const [all, balances] = await Promise.all([getAccounts(), getBalances()]);
  const visible = all.filter(a => showArchived || !a.archived_at);
  const editing = typeof editar === "string" ? all.find(a => a.id === editar) : undefined;
  const archivedCount = all.filter(a => a.archived_at).length;

  // Group by institution: one bank can have several accounts.
  const groups = new Map<string, typeof visible>();
  for (const a of visible) groups.set(a.institution_name, [...(groups.get(a.institution_name) ?? []), a]);

  return (
    <>
      <PageHeader title="Contas" description="Contas correntes, poupanças, carteiras digitais e dinheiro em espécie, cadastradas manualmente. Nada é conectado ao banco.">
        {archivedCount > 0 && (
          <Link href={showArchived ? "/contas" : "/contas?arquivadas=1"} className={buttonVariants({ variant: "secondary", size: "sm" })}>
            {showArchived ? "Ocultar arquivadas" : `Mostrar arquivadas (${archivedCount})`}
          </Link>
        )}
      </PageHeader>

      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <div className="grid content-start gap-4">
          {visible.length === 0 && (
            <Card><p className="text-sm text-muted">Nenhuma conta ainda. Adicione a primeira ao lado — por exemplo, sua conta corrente principal.</p></Card>
          )}
          {[...groups].map(([institution, accounts]) => (
            <Card key={institution} className="p-0">
              <h2 className="border-b border-line px-5 py-3 text-sm font-medium text-muted">{institution}</h2>
              <ul className="divide-y divide-line">
                {accounts.map(a => (
                  <li key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{a.name} {a.archived_at && <Badge className="ml-1">Arquivada</Badge>}</p>
                      <p className="text-xs text-muted">{ACCOUNT_KIND_LABEL[a.kind]} · saldo inicial {formatBRL(centsFromText(a.opening_balance_cents))} em {formatDateBR(a.opening_date)}</p>
                    </div>
                    <div className="text-right">
                      <p className="tabular font-medium">{formatBRL(centsFromText(balances.get(a.id)?.balance ?? a.opening_balance_cents))}</p>
                      <p className="text-xs text-muted">saldo atual</p>
                    </div>
                    <div className="flex gap-2">
                      {!a.archived_at && <Link href={`/contas?editar=${a.id}`} className={buttonVariants({ variant: "secondary", size: "sm" })}>Editar</Link>}
                      <form action={setAccountArchived}>
                        <input type="hidden" name="id" value={a.id} />
                        <input type="hidden" name="archive" value={a.archived_at ? "0" : "1"} />
                        <Button variant="ghost" size="sm">{a.archived_at ? "Restaurar" : "Arquivar"}</Button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
          <p className="text-xs text-muted">Arquivar esconde a conta das listas e totais, mas preserva o histórico. Não há exclusão.</p>
        </div>

        <Card className="content-start">
          <h2 className="mb-4 font-medium">{editing ? `Editar “${editing.name}”` : "Nova conta"}</h2>
          <AccountForm
            key={editing?.id ?? "new"}
            today={todayInBrazil()}
            account={editing && {
              id: editing.id,
              institution: editing.institution_name,
              name: editing.name,
              kind: editing.kind,
              balance: centsToInput(centsFromText(editing.opening_balance_cents)),
              opening_date: editing.opening_date,
            }}
          />
        </Card>
      </div>
    </>
  );
}
