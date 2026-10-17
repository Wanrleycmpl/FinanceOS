import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Cartões e faturas" };

export default function Page() {
  return <ComingSoon title="Cartões e faturas" delivery="Entrega 04" items={[
    "Cartões com banco, final, limite, fechamento e vencimento.",
    "Limite total, comprometido (inclui parcelas futuras) e disponível — limite não é dinheiro em conta.",
    "Faturas abertas, fechadas, pagas, parciais e atrasadas; fatura manual marcada como estimada.",
    "Pagamento de fatura reduz caixa e dívida sem contar a compra de novo.",
  ]} />;
}
