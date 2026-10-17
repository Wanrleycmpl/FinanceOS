"use client";
import { useActionState, useState } from "react";
import { createPlan } from "@/app/actions/installments";
import { Button, Field, FormMessage, Input, Select } from "@/components/ui";
import type { AccountOption, CategoryOption } from "@/components/transaction-form";
import { formatBRL, parseBRL, splitCents } from "@/lib/money";

export function InstallmentForm({ accounts, cards, categories, today }: { accounts: AccountOption[]; cards: AccountOption[]; categories: CategoryOption[]; today: string }) {
  const [state, action, pending] = useActionState(createPlan, undefined);
  const [total, setTotal] = useState("");
  const [count, setCount] = useState("3");
  const [means, setMeans] = useState("");
  const cents = parseBRL(total);
  const n = Number(count);
  const preview = cents !== null && Number.isInteger(n) && n >= 2 && n <= 72 && cents >= BigInt(n) ? splitCents(cents, n) : null;

  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="O que foi comprado" htmlFor="description"><Input id="description" name="description" required maxLength={120} placeholder="Ex.: Geladeira" /></Field>
        <Field label="Valor total (R$)" htmlFor="total"><Input id="total" name="total" inputMode="decimal" required placeholder="0,00" className="tabular" value={total} onChange={e => setTotal(e.target.value)} /></Field>
        <Field label="Parcelas" htmlFor="count" hint="De 2 a 72."><Input id="count" name="count" type="number" min={2} max={72} required value={count} onChange={e => setCount(e.target.value)} /></Field>
        <Field label="Data da 1ª parcela" htmlFor="first_date" hint="As demais caem no mesmo dia dos meses seguintes."><Input id="first_date" name="first_date" type="date" required defaultValue={today} /></Field>
        <Field label="Pago com" htmlFor="means">
          <Select id="means" name="means" required value={means} onChange={e => setMeans(e.target.value)}>
            <option value="" disabled>Escolha…</option>
            {cards.length > 0 && <optgroup label="Cartões de crédito">{cards.map(c => <option key={c.id} value={`card:${c.id}`}>{c.label}</option>)}</optgroup>}
            <optgroup label="Contas (carnê, boleto, débito)">{accounts.map(a => <option key={a.id} value={`account:${a.id}`}>{a.label}</option>)}</optgroup>
          </Select>
        </Field>
        <Field label="Categoria" htmlFor="category_id">
          <Select id="category_id" name="category_id" defaultValue="">
            <option value="">Sem categoria</option>
            {categories.filter(c => c.kind !== "income").map(c => (
              <optgroup key={c.id} label={c.name}>
                <option value={c.id}>{c.name} (geral)</option>
                {c.children.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </optgroup>
            ))}
          </Select>
        </Field>
        {means.startsWith("account:") && (
          <Field label="Parcelas já pagas" htmlFor="paid_count" hint="Para registrar um carnê que já começou. Só parcelas com data até hoje.">
            <Input id="paid_count" name="paid_count" type="number" min={0} max={72} defaultValue={0} />
          </Field>
        )}
      </div>
      <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm text-muted" aria-live="polite">
        {preview
          ? <>Prévia: {preview.length}× · 1ª parcela <strong className="tabular text-ink">{formatBRL(preview[0])}</strong>{preview[0] !== preview[preview.length - 1] && <> · demais <strong className="tabular text-ink">{formatBRL(preview[preview.length - 1])}</strong></>} · soma exata <strong className="tabular text-ink">{formatBRL(cents!)}</strong>. Os centavos que sobram vão para as primeiras parcelas.</>
          : "Informe o total e o número de parcelas para ver a divisão."}
        {means.startsWith("card:") && " No cartão, cada parcela entra na fatura do seu mês e todas comprometem o limite desde já."}
        {means.startsWith("account:") && " Na conta, cada parcela fica pendente até você confirmar o pagamento."}
      </p>
      <FormMessage state={state} />
      <div><Button disabled={pending}>{pending ? "Criando…" : "Criar parcelamento"}</Button></div>
    </form>
  );
}
