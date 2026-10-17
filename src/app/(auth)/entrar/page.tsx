import type { Metadata } from "next";
import { SignInForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Entrar" };

export default function Page() {
  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">Entrar</h1>
      <p className="mb-6 text-sm text-muted">App pessoal: acesso com o seu usuário.</p>
      <SignInForm />
    </>
  );
}
