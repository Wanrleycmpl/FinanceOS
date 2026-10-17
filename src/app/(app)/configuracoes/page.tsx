import type { Metadata } from "next";
import { signOut } from "@/app/actions/auth";
import { NewPasswordForm } from "@/components/auth-forms";
import { ProfileForm } from "@/components/forms";
import { Button, Card, PageHeader } from "@/components/ui";
import { getProfile } from "@/lib/data";
import { LOGIN_EMAIL_DOMAIN } from "@/lib/login";

export const metadata: Metadata = { title: "Configurações" };

export default async function Page() {
  const profile = await getProfile();
  const login = profile.email.endsWith(`@${LOGIN_EMAIL_DOMAIN}`) ? profile.email.split("@")[0] : profile.email;
  return (
    <>
      <PageHeader title="Configurações" description="Perfil, senha e sessão. Moeda fixa em reais (BRL) e datas no horário de Brasília." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 font-medium">Perfil</h2>
          <ProfileForm displayName={profile.displayName} />
        </Card>
        <Card className="grid content-start gap-4">
          <h2 className="font-medium">Acesso</h2>
          <div className="text-sm">
            <p className="text-muted">Usuário</p>
            <p>{login}</p>
          </div>
          <form action={signOut}><Button variant="danger">Sair</Button></form>
        </Card>
        <Card>
          <h2 className="mb-4 font-medium">Trocar senha</h2>
          <NewPasswordForm />
        </Card>
      </div>
    </>
  );
}
