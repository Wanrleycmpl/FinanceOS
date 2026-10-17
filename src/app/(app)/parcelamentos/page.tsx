import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Parcelamentos" };

export default function Page() {
  return <ComingSoon title="Parcelamentos" delivery="Entrega 05" items={[
    "Compra original, total, número de parcelas, cronograma e progresso.",
    "Centavos distribuídos exatamente: R$ 100,00 em 3x = R$ 33,34 + R$ 33,33 + R$ 33,33.",
    "Parcela só é paga com confirmação; data passada não comprova pagamento.",
    "A compra original não é somada junto com as parcelas.",
  ]} />;
}
