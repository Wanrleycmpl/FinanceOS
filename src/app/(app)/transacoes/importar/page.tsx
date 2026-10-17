import type { Metadata } from "next";
import Link from "next/link";
import { CsvImporter } from "@/components/csv-importer";
import { buttonVariants, PageHeader } from "@/components/ui";
import { getAccounts } from "@/lib/data";
import { todayInBrazil } from "@/lib/dates";

export const metadata: Metadata = { title: "Importar CSV" };

export default async function Page() {
  const accounts = (await getAccounts()).filter(a => !a.archived_at);
  return (
    <>
      <PageHeader title="Importar extrato (CSV)" description="Traga lançamentos do arquivo que o seu banco exporta. Você confere tudo antes de gravar; nada é conectado ao banco.">
        <Link href="/transacoes" className={buttonVariants({ variant: "ghost", size: "sm" })}>Voltar para transações</Link>
      </PageHeader>
      <CsvImporter accounts={accounts.map(a => ({ id: a.id, label: `${a.institution_name} · ${a.name}` }))} today={todayInBrazil()} />
    </>
  );
}
