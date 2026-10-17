"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { saveSubscription } from "@/app/actions/subscriptions";
import { Button, buttonVariants, Field, FormMessage, Input, Select } from "@/components/ui";
import type { AccountOption, CategoryOption } from "@/components/transaction-form";
import { formatBRL, parseBRL } from "@/lib/money";
import { monthlyEquivalent, PERIOD_LABEL, type Period } from "@/lib/subscriptions";

type Defaults = { id: string; name: string; amount: string; period: Period; next_charge_date: string; means: string; category_id: string | null };

export function SubscriptionForm({ accounts, cards, categories, today, subscription }: {
  accounts: AccountOption[]; cards: AccountOption[]; categories: CategoryOption[]; today: string; subscription?: Defaults;
}) {
  const [state, action, pending] = useActionState(saveSubscription, undefined);
  const [amount, setAmount] = useState(subscription?.amount ?? "");
  const [period, setPeriod] = useState<Period>(subscription?.period ?? "monthly");
  const cents = parseBRL(amount);
  const eq = cents !== null && cents > 0n ? monthlyEquivalent(cents, period) : null;

  return (
    <form action={action} className="grid gap-4" key={state?.ok ?? "form"}>
      <input type="hidden" name="id" value={subscription?.id ?? ""} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Serviço" htmlFor="sub-name"><Input id="sub-name" name="name" required maxLength={80} placeholder="Ex.: Streaming de vídeo" defaultValue={subscription?.name} /></Field>
        <Field label="Valor de cada cobrança (R$)" htmlFor="sub-amount"><Input id="sub-amount" name="amount" inputMode="decimal" required placeholder="0,00" className="tabular" value={amount} onChange={e => setAmount(e.target.value)} /></Field>
        <Field label="Periodicidade" htmlFor="sub-period">
          <Select id="sub-period" name="period" value={period} onChange={e => setPeriod(e.target.value as Period)}>
            {Object.entries(PERIOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v.charAt(0).toUpperCase() + v.slice(1)}</option>)}
          </Select>
        </Field>
        <Field label="Próxima cobrança" htmlFor="sub-next" hint="O dia desta data vira o dia da cobrança (31 cai no último dia em meses curtos).">
          <Input id="sub-next" name="next_charge_date" type="date" required defaultValue={subscription?.next_charge_date ?? today} />
        </Field>
        <Field label="Cobrada em" htmlFor="sub-means">
          <Select id="sub-means" name="means" required defaultValue={subscription?.means ?? ""}>
            <option value="" disabled>Escolha…</option>
            {cards.length > 0 && <optgroup label="Cartões de crédito">{cards.map(c => <option key={c.id} value={`card:${c.id}`}>{c.label}</option>)}</optgroup>}
            <optgroup label="Contas">{accounts.map(a => <option key={a.id} value={`account:${a.id}`}>{a.label}</option>)}</optgroup>
          </Select>
        </Field>
        <Field label="Categoria" htmlFor="sub-category">
          <Select id="sub-category" name="category_id" defaultValue={subscription?.category_id ?? ""}>
            <option value="">Sem categoria</option>
            {categories.filter(c => c.kind !== "income").map(c => (
              <optgroup key={c.id} label={c.name}>
                <option value={c.id}>{c.name} (geral)</option>
                {c.children.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </optgroup>
            ))}
          </Select>
        </Field>
      </div>
      <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm text-muted" aria-live="polite">
        {eq ? <>Equivale a <strong className="tabular text-ink">{eq.exact ? "" : "≈ "}{formatBRL(eq.cents)} por mês</strong> ({eq.formula}).</> : "Informe o valor para ver o equivalente mensal."}{" "}
        Cadastrar não cria despesa: a despesa só existe quando você registra a cobrança.
      </p>
      <FormMessage state={state} />
      <div className="flex flex-wrap gap-2">
        <Button disabled={pending}>{pending ? "Salvando…" : subscription ? "Salvar alterações" : "Adicionar assinatura"}</Button>
        {subscription && <Link href="/assinaturas" className={buttonVariants({ variant: "ghost" })}>Cancelar</Link>}
      </div>
    </form>
  );
}
