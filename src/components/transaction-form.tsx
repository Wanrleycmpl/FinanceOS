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
  id: string; nature: Nature; direction: "in" | "out"; account_id: string | null; to_account_id: string | null; card_id: string | null;
  statement_month: string | null; category_id: string | null; description: string; amount: string; date: string; status: "settled" | "pending";
};

// Which category kinds fit each type of transaction (same rule as the database trigger).
const KINDS: Record<Nature, CategoryKind[]> = {
  expense: ["expense", "mixed"], income: ["income", "mixed"], financial: ["expense", "income", "mixed"], transfer: ["mixed"], refund: [], card_payment: [],
};

export function TransactionForm(props: {
  accounts: AccountOption[]; cards: AccountOption[]; categories: CategoryOption[]; today: string; back: string;
  defaults?: TransactionDefaults;
  refund?: { id: string; description: string; means: string; remaining: string };
  payment?: { card_id: string; statement_month: string; amount: string };
}) {
  const { accounts, cards, categories, today, back, defaults, refund, payment } = props;
  const [state, action, pending] = useActionState(saveTransaction, undefined);
  const [nature, setNature] = useState<Nature>(refund ? "refund" : payment ? "card_payment" : defaults?.nature ?? "expense");
  const initialMeans = defaults ? (defaults.card_id && defaults.nature !== "card_payment" ? `card:${defaults.card_id}` : defaults.account_id ? `account:${defaults.account_id}` : "") : "";
  const [means, setMeans] = useState(initialMeans);
  const editing = Boolean(defaults);
  const cats = categories.filter(c => KINDS[nature].includes(c.kind));
  const accountSelect = (name: string, label: string, value?: string | null) => (
    <Field label={label} htmlFor={name}>
      <Select id={name} name={name} required defaultValue={value ?? ""}>
        <option value="" disabled>Escolha…</option>
        {accounts.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
      </Select>
    </Field>
  );

  return (
    <form action={action} className="grid gap-4" key={state?.ok ?? "form"}>
      <input type="hidden" name="id" value={defaults?.id ?? ""} />
      <input type="hidden" name="back" value={back} />
      {refund && <><input type="hidden" name="refund_of" value={refund.id} /><input type="hidden" name="means" value={refund.means} /></>}
      {(editing || refund || payment) && <input type="hidden" name="nature" value={nature} />}

      {refund && (
        <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm text-muted">
          Estorno de <strong className="text-ink">{refund.description}</strong>. Ainda pode ser estornado: <strong className="tabular text-ink">{refund.remaining}</strong>. O estorno usa o mesmo meio e a mesma categoria da compra, reduz a despesa e não vira receita.
        </p>
      )}
      {nature === "card_payment" && (
        <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm text-muted">
          O pagamento sai da conta e reduz a dívida do cartão. Ele <strong className="text-ink">não é uma nova despesa</strong>: as compras já foram contadas na data em que aconteceram.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {!refund && !payment && (
          <Field label="Tipo" htmlFor="nature" hint={editing ? "O tipo não muda depois de criado. Para trocar, mande para a lixeira e crie outro." : undefined}>
            <Select id="nature" name={editing ? undefined : "nature"} value={nature} onChange={e => setNature(e.target.value as Nature)} disabled={editing}>
              <option value="expense">Despesa</option>
              <option value="income">Receita</option>
              <option value="transfer">Transferência entre minhas contas</option>
              <option value="financial">Movimentação financeira (aporte, resgate, empréstimo)</option>
              {(cards.length > 0 || nature === "card_payment") && <option value="card_payment">Pagamento de fatura de cartão</option>}
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
          <Input id="description" name="description" required maxLength={140}
            defaultValue={defaults?.description ?? (refund ? `Estorno: ${refund.description}` : payment ? "Pagamento de fatura" : "")} />
        </Field>
        <Field label="Valor (R$)" htmlFor="amount" hint="Sempre positivo. Ex.: 1.234,56">
          <Input id="amount" name="amount" inputMode="decimal" required placeholder="0,00" defaultValue={defaults?.amount ?? payment?.amount} className="tabular" />
        </Field>
        <Field label="Data" htmlFor="date" hint={means.startsWith("card:") ? "Data da compra: define a fatura." : undefined}>
          <Input id="date" name="date" type="date" required defaultValue={defaults?.date ?? today} />
        </Field>
        <Field label="Situação" htmlFor="status" hint="Pendente não muda saldo nem resultado até ser liquidado.">
          <Select id="status" name="status" defaultValue={defaults?.status ?? "settled"}>
            <option value="settled">Liquidado (já aconteceu)</option>
            <option value="pending">Pendente (previsto)</option>
          </Select>
        </Field>

        {nature === "expense" && (
          <Field label="Pago com" htmlFor="means">
            <Select id="means" name="means" required value={means} onChange={e => setMeans(e.target.value)}>
              <option value="" disabled>Escolha…</option>
              <optgroup label="Contas">{accounts.map(a => <option key={a.id} value={`account:${a.id}`}>{a.label}</option>)}</optgroup>
              {cards.length > 0 && <optgroup label="Cartões de crédito">{cards.map(c => <option key={c.id} value={`card:${c.id}`}>{c.label}</option>)}</optgroup>}
            </Select>
          </Field>
        )}
        {(nature === "expense" || nature === "refund") && (means.startsWith("card:") || refund?.means.startsWith("card:")) && (
          <Field label="Fatura (mês de fechamento)" htmlFor="statement_month" hint={defaults?.statement_month ? `Hoje: ${defaults.statement_month.slice(5, 7)}/${defaults.statement_month.slice(0, 4)}. Vazio = recalcular pela data; preencha só para mover de fatura.` : "Vazio = calculada pela data e pelo dia de fechamento do cartão."}>
            <Input id="statement_month" name="statement_month" type="month" defaultValue="" />
          </Field>
        )}
        {nature === "card_payment" && (
          <>
            {accountSelect("account_id", "Sai da conta", defaults?.account_id)}
            <Field label="Cartão" htmlFor="card_id">
              <Select id="card_id" name="card_id" required defaultValue={defaults?.card_id ?? payment?.card_id ?? ""}>
                <option value="" disabled>Escolha…</option>
                {cards.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </Select>
            </Field>
            <Field label="Fatura paga (mês de fechamento)" htmlFor="statement_month">
              <Input id="statement_month" name="statement_month" type="month" required defaultValue={(defaults?.statement_month ?? payment?.statement_month ?? "").slice(0, 7)} />
            </Field>
          </>
        )}
        {(nature === "income" || nature === "transfer" || nature === "financial") &&
          accountSelect("account_id", nature === "transfer" ? "Sai da conta" : nature === "income" ? "Entra na conta" : "Conta", defaults?.account_id)}
        {nature === "transfer" && accountSelect("to_account_id", "Entra na conta", defaults?.to_account_id)}
        {nature !== "refund" && nature !== "card_payment" && (
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
      {accounts.length === 0 && cards.length === 0 && <p className="text-sm text-warning">Cadastre uma conta (ou um cartão) antes de lançar.</p>}
      <FormMessage state={state} />
      <div className="flex flex-wrap gap-2">
        <Button disabled={pending || (accounts.length === 0 && cards.length === 0)}>
          {pending ? "Salvando…" : editing ? "Salvar alterações" : refund ? "Registrar estorno" : payment || nature === "card_payment" ? "Registrar pagamento" : "Adicionar lançamento"}
        </Button>
        <Link href={back} className={buttonVariants({ variant: "ghost" })}>{editing || refund || payment ? "Cancelar" : "Fechar"}</Link>
      </div>
    </form>
  );
}
