"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { saveTransaction } from "@/app/actions/transactions";
import { Button, buttonVariants, Field, FormMessage, Input, Select } from "@/components/ui";
import type { CategoryKind } from "@/lib/catalog";
import type { Nature } from "@/lib/transactions";

export type AccountOption = { id: string; label: string };
export type CategoryOption = { id: string; name: string; kind: CategoryKind; children: { id: string; name: string }[] };
export type TransactionDefaults = {
  id: string; nature: Nature; direction: "in" | "out"; account_id: string; to_account_id: string | null;
  category_id: string | null; description: string; amount: string; date: string; status: "settled" | "pending";
};

// Which category kinds fit each type of transaction (same rule as the database trigger).
const KINDS: Record<Nature, CategoryKind[]> = {
  expense: ["expense", "mixed"], income: ["income", "mixed"], financial: ["expense", "income", "mixed"], transfer: ["mixed"], refund: [],
};

export function TransactionForm(props: {
  accounts: AccountOption[]; categories: CategoryOption[]; today: string; back: string;
  defaults?: TransactionDefaults; refund?: { id: string; description: string; account_id: string; remaining: string };
}) {
  const { accounts, categories, today, back, defaults, refund } = props;
  const [state, action, pending] = useActionState(saveTransaction, undefined);
  const [nature, setNature] = useState<Nature>(refund ? "refund" : defaults?.nature ?? "expense");
  const editing = Boolean(defaults);
  const cats = categories.filter(c => KINDS[nature].includes(c.kind));

  return (
    <form action={action} className="grid gap-4" key={state?.ok ?? "form"}>
      <input type="hidden" name="id" value={defaults?.id ?? ""} />
      <input type="hidden" name="back" value={back} />
      {refund && <input type="hidden" name="refund_of" value={refund.id} />}
      {(editing || refund) && <input type="hidden" name="nature" value={nature} />}

      {refund && (
        <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm text-muted">
          Estorno de <strong className="text-ink">{refund.description}</strong>. Ainda pode ser estornado: <strong className="tabular text-ink">{refund.remaining}</strong>. O estorno reduz essa despesa e usa a mesma categoria; não vira receita.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {!refund && (
          <Field label="Tipo" htmlFor="nature" hint={editing ? "O tipo não muda depois de criado. Para trocar, mande para a lixeira e crie outro." : undefined}>
            <Select id="nature" name={editing ? undefined : "nature"} value={nature} onChange={e => setNature(e.target.value as Nature)} disabled={editing}>
              <option value="expense">Despesa</option>
              <option value="income">Receita</option>
              <option value="transfer">Transferência entre minhas contas</option>
              <option value="financial">Movimentação financeira (aporte, resgate, empréstimo)</option>
            </Select>
          </Field>
        )}
        {nature === "financial" && (
          <Field label="Sentido" htmlFor="direction" hint="Não entra em receitas nem despesas; só muda o saldo.">
            <Select id="direction" name="direction" defaultValue={defaults?.direction ?? "out"}>
              <option value="out">Saiu da conta (aporte, pagamento de empréstimo)</option>
              <option value="in">Entrou na conta (resgate, empréstimo recebido)</option>
            </Select>
          </Field>
        )}
        <Field label="Descrição" htmlFor="description">
          <Input id="description" name="description" required maxLength={140} defaultValue={defaults?.description ?? (refund ? `Estorno: ${refund.description}` : "")} />
        </Field>
        <Field label="Valor (R$)" htmlFor="amount" hint="Sempre positivo. Ex.: 1.234,56">
          <Input id="amount" name="amount" inputMode="decimal" required placeholder="0,00" defaultValue={defaults?.amount} className="tabular" />
        </Field>
        <Field label="Data" htmlFor="date">
          <Input id="date" name="date" type="date" required defaultValue={defaults?.date ?? today} />
        </Field>
        <Field label="Situação" htmlFor="status" hint="Pendente não muda o saldo nem o resultado até ser liquidado.">
          <Select id="status" name="status" defaultValue={defaults?.status ?? "settled"}>
            <option value="settled">Liquidado (já aconteceu)</option>
            <option value="pending">Pendente (previsto)</option>
          </Select>
        </Field>
        <Field label={nature === "transfer" ? "Sai da conta" : nature === "income" || nature === "refund" ? "Entra na conta" : "Conta"} htmlFor="account_id">
          <Select id="account_id" name="account_id" required defaultValue={defaults?.account_id ?? refund?.account_id ?? ""}>
            <option value="" disabled>Escolha…</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
          </Select>
        </Field>
        {nature === "transfer" && (
          <Field label="Entra na conta" htmlFor="to_account_id">
            <Select id="to_account_id" name="to_account_id" required defaultValue={defaults?.to_account_id ?? ""}>
              <option value="" disabled>Escolha…</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
            </Select>
          </Field>
        )}
        {nature !== "refund" && (
          <Field label="Categoria" htmlFor="category_id" hint={nature === "transfer" ? "Opcional. Transferência própria não conta como receita nem despesa." : undefined}>
            <Select id="category_id" name="category_id" defaultValue={defaults?.category_id ?? ""} key={nature}>
              <option value="">Sem categoria</option>
              {cats.map(c => (
                <optgroup key={c.id} label={c.name}>
                  <option value={c.id}>{c.name} (geral)</option>
                  {c.children.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </optgroup>
              ))}
            </Select>
          </Field>
        )}
      </div>
      {accounts.length === 0 && <p className="text-sm text-warning">Cadastre uma conta em Contas antes de lançar.</p>}
      <FormMessage state={state} />
      <div className="flex flex-wrap gap-2">
        <Button disabled={pending || accounts.length === 0}>{pending ? "Salvando…" : editing ? "Salvar alterações" : refund ? "Registrar estorno" : "Adicionar lançamento"}</Button>
        <Link href={back} className={buttonVariants({ variant: "ghost" })}>{editing || refund ? "Cancelar" : "Fechar"}</Link>
      </div>
    </form>
  );
}
