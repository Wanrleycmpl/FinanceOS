import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Transações" };

export default function Page() {
  return <ComingSoon title="Transações" delivery="Entrega 02" items={[
    "Receitas, despesas, transferências entre suas contas e estornos, com valores exatos.",
    "Filtros por período, conta, categoria, natureza e status; busca e paginação.",
    "Ocultar da lista é diferente de excluir dos relatórios; lixeira com restauração.",
    "Importação CSV com prévia, mapeamento de colunas e proteção contra duplicatas.",
  ]} />;
}
