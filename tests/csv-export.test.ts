import { describe, expect, it } from "vitest";
import { transactionsToCsv } from "@/lib/csv-export";

describe("exportação CSV", () => {
  it("gera CSV brasileiro com sinal, centavos exatos e proteção contra fórmulas", () => {
    const csv = transactionsToCsv([
      { date: "2026-03-10", description: "Mercado; \"centro\"", nature: "expense", direction: "out", category: "Alimentação › Supermercado", account: "Banco · Conta", toAccount: "", amount_cents: "123456", status: "settled", hidden: false, excluded: false },
      { date: "2026-03-11", description: "=HYPERLINK(\"x\")", nature: "income", direction: "in", category: "", account: "Banco · Conta", toAccount: "", amount_cents: "1", status: "pending", hidden: true, excluded: true },
    ]);
    const lines = csv.slice(1).trimEnd().split("\r\n");
    expect(csv.startsWith("﻿")).toBe(true);
    expect(lines[0]).toBe("Data;Descrição;Tipo;Categoria;Conta;Conta destino;Valor (R$);Situação;Oculto;Fora dos relatórios");
    expect(lines[1]).toBe('10/03/2026;"Mercado; ""centro""";Despesa;Alimentação › Supermercado;Banco · Conta;;"-1234,56";Liquidado;não;não');
    expect(lines[2]).toBe('11/03/2026;"\'=HYPERLINK(""x"")";Receita;;Banco · Conta;;0,01;Pendente;sim;sim');
  });
});
