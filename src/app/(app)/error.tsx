"use client";
import { Button, Card } from "@/components/ui";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <Card className="grid justify-items-start gap-3">
      <h1 className="text-lg font-semibold">Algo deu errado</h1>
      <p className="text-sm text-muted">{/^(Não foi possível|Supabase não configurado)/.test(error.message) ? error.message : "Não conseguimos carregar esta tela."}</p>
      <Button variant="secondary" onClick={reset}>Tentar de novo</Button>
    </Card>
  );
}
