"use client";
import Link from "next/link";
import { useActionState } from "react";
import { saveAccount } from "@/app/actions/accounts";
import { createCategory, renameCategory } from "@/app/actions/categories";
import { updateProfile } from "@/app/actions/profile";
import { Button, buttonVariants, Field, FormMessage, Input, Select } from "@/components/ui";

type AccountDefaults = { id: string; institution: string; name: string; kind: string; balance: string; opening_date: string };

export function AccountForm({ account, today }: { account?: AccountDefaults; today: string }) {
  const [state, action, pending] = useActionState(saveAccount, undefined);
  const editing = Boolean(account);
  return (
    <form action={action} className="grid gap-4" key={state?.ok ?? "form"}>
      <input type="hidden" name="id" value={account?.id ?? ""} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Instituição" htmlFor="institution" hint="Ex.: Nubank, Itaú, Carteira física.">
          <Input id="institution" name="institution" defaultValue={account?.institution} required maxLength={80} />
        </Field>
        <Field label="Nome da conta" htmlFor="name" hint="Ex.: Conta principal.">
          <Input id="name" name="name" defaultValue={account?.name} required maxLength={60} />
        </Field>
        <Field label="Tipo" htmlFor="kind">
          <Select id="kind" name="kind" defaultValue={account?.kind ?? "checking"}>
            <option value="checking">Conta corrente</option>
            <option value="savings">Poupança</option>
            <option value="wallet">Carteira digital</option>
            <option value="cash">Dinheiro</option>
          </Select>
        </Field>
        <Field label="Saldo inicial (R$)" htmlFor="balance" hint="Use vírgula para centavos. Negativo com sinal de menos.">
          <Input id="balance" name="balance" inputMode="decimal" placeholder="0,00" defaultValue={account?.balance} className="tabular" />
        </Field>
        <Field label="Data do saldo inicial" htmlFor="opening_date" hint="O saldo informado vale a partir deste dia.">
          <Input id="opening_date" name="opening_date" type="date" max={today} defaultValue={account?.opening_date ?? today} required />
        </Field>
      </div>
      <FormMessage state={state} />
      <div className="flex flex-wrap gap-2">
        <Button disabled={pending}>{pending ? "Salvando…" : editing ? "Salvar alterações" : "Adicionar conta"}</Button>
        {editing && <Link href="/contas" className={buttonVariants({ variant: "ghost" })}>Cancelar</Link>}
      </div>
    </form>
  );
}

export function CategoryCreateForm({ parents }: { parents: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(createCategory, undefined);
  return (
    <form action={action} className="grid gap-4" key={state?.ok ?? "form"}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Nome" htmlFor="cat-name"><Input id="cat-name" name="name" required maxLength={60} /></Field>
        <Field label="Dentro de" htmlFor="cat-parent" hint="Vazio cria uma categoria principal.">
          <Select id="cat-parent" name="parent_id" defaultValue="">
            <option value="">— Categoria principal —</option>
            {parents.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        <Field label="Tipo" htmlFor="cat-kind" hint="Subcategoria usa o tipo da principal.">
          <Select id="cat-kind" name="kind" defaultValue="expense">
            <option value="expense">Despesa</option>
            <option value="income">Receita</option>
            <option value="mixed">Mista</option>
          </Select>
        </Field>
      </div>
      <FormMessage state={state} />
      <div><Button disabled={pending}>{pending ? "Criando…" : "Criar"}</Button></div>
    </form>
  );
}

export function CategoryRenameForm({ id, name }: { id: string; name: string }) {
  const [state, action, pending] = useActionState(renameCategory, undefined);
  return (
    <form action={action} className="flex flex-wrap items-start gap-2">
      <input type="hidden" name="id" value={id} />
      <label htmlFor={`rename-${id}`} className="sr-only">Novo nome</label>
      <Input id={`rename-${id}`} name="name" defaultValue={name} required maxLength={60} autoFocus className="h-8 max-w-xs" />
      <Button size="sm" disabled={pending}>Salvar</Button>
      <Link href="/categorias" className={buttonVariants({ variant: "ghost", size: "sm" })}>Cancelar</Link>
      <div className="w-full"><FormMessage state={state} /></div>
    </form>
  );
}

export function ProfileForm({ displayName }: { displayName: string }) {
  const [state, action, pending] = useActionState(updateProfile, undefined);
  return (
    <form action={action} className="grid gap-4">
      <Field label="Nome" htmlFor="display_name"><Input id="display_name" name="display_name" defaultValue={displayName} required maxLength={60} /></Field>
      <FormMessage state={state} />
      <div><Button disabled={pending}>{pending ? "Salvando…" : "Salvar"}</Button></div>
    </form>
  );
}
