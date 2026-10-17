"use client";
import { useActionState } from "react";
import { signIn, updatePassword } from "@/app/actions/auth";
import { Button, Field, FormMessage, Input } from "@/components/ui";

export function SignInForm() {
  const [state, action, pending] = useActionState(signIn, undefined);
  return (
    <form action={action} className="grid gap-4">
      <Field label="Usuário" htmlFor="login">
        <Input id="login" name="login" autoComplete="username" autoCapitalize="none" spellCheck={false} required />
      </Field>
      <Field label="Senha" htmlFor="password"><Input id="password" name="password" type="password" autoComplete="current-password" required /></Field>
      <FormMessage state={state} />
      <Button disabled={pending}>{pending ? "Entrando…" : "Entrar"}</Button>
    </form>
  );
}

export function NewPasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, undefined);
  return (
    <form action={action} className="grid gap-4" key={state?.ok ?? "form"}>
      <Field label="Nova senha" htmlFor="password" hint="Mínimo de 6 caracteres."><Input id="password" name="password" type="password" autoComplete="new-password" required minLength={6} /></Field>
      <Field label="Repita a nova senha" htmlFor="confirm"><Input id="confirm" name="confirm" type="password" autoComplete="new-password" required /></Field>
      <FormMessage state={state} />
      <div><Button disabled={pending}>{pending ? "Salvando…" : "Trocar senha"}</Button></div>
    </form>
  );
}
