import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Assinaturas" };

export default function Page() {
  return <ComingSoon title="Assinaturas" delivery="Entrega 06" items={[
    "Serviço, valor, periodicidade, conta ou cartão, categoria, próxima cobrança e status.",
    "Total mensal equivalente explicado: R$ 120,00 por ano = R$ 10,00 por mês.",
    "A previsão de cobrança não vira uma segunda despesa além da transação real.",
  ]} />;
}
