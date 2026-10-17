import { describe, expect, it } from "vitest";
import { buildRows, detectDelimiter, filePeriod, guessMapping, normalizeText, parseAmount, parseCsv, parseDate } from "@/lib/csv-import";

describe("leitura de CSV", () => {
  it("detecta separador e lida com BOM, CRLF, aspas e quebra de linha dentro de aspas", () => {
    const text = normalizeText('﻿Data;Descrição;Valor\r\n01/04/2026;"Mercado; ""Centro""";-12,34\r\n02/04/2026;"Linha\r\ndupla";1.000,00\r\n\r\n');
    expect(detectDelimiter(text)).toBe(";");
    expect(parseCsv(text, ";")).toEqual([["Data", "Descrição", "Valor"], ["01/04/2026", 'Mercado; "Centro"', "-12,34"], ["02/04/2026", "Linha\ndupla", "1.000,00"]]);
    expect(detectDelimiter("Data,Valor,Identificador,Descrição\n")).toBe(",");
  });

  it("converte datas brasileiras e ISO, recusando datas impossíveis", () => {
    expect(parseDate("01/04/2026")).toBe("2026-04-01");
    expect(parseDate("1/4/26")).toBe("2026-04-01");
    expect(parseDate("2026-04-01")).toBe("2026-04-01");
    expect(parseDate("31/02/2026")).toBeNull();
    expect(parseDate("04/31/2026")).toBeNull();
  });

  it("converte valores para centavos exatos em vários formatos de banco", () => {
    const cases: [string, bigint | null][] = [["1.234,56", 123456n], ["-12,34", -1234n], ["R$ -0,05", -5n], ["(12,34)", -1234n], ["12,34-", -1234n], ["-12.34", -1234n], ["0.1", 10n], ["1.234", 123400n], ["1234", 123400n], ["+5,5", 550n], ["12,345", null], ["abc", null], ["1.2.3", null]];
    for (const [input, expected] of cases) expect(parseAmount(input), input).toBe(expected);
  });

  it("adivinha as colunas pelo cabeçalho (ex.: Nubank)", () => {
    expect(guessMapping(["Data", "Valor", "Identificador", "Descrição"])).toEqual({ date: 0, description: 3, amount: 1, externalId: 2 });
    expect(guessMapping(["Data", "Histórico", "Valor"])).toEqual({ date: 0, description: 1, amount: 2, externalId: null });
  });

  it("monta linhas validadas, inverte sinal se pedido e marca repetidas sem ID distinto", () => {
    const table = parseCsv(normalizeText("Data,Valor,Identificador,Descrição\n02/04/2026,-7.00,A1,Café\n02/04/2026,-7.00,A2,Café\n03/04/2026,abc,A3,Erro\n03/04/2026,50,,Pix recebido\n03/04/2026,50,,Pix recebido\n"), ",");
    const rows = buildRows(table, guessMapping(table[0]), { header: true, invertSign: false });
    expect(rows.map(r => [r.line, r.direction, r.amount_cents, r.external_id, r.error, r.repeatedInFile])).toEqual([
      [2, "out", "700", "A1", null, false],
      [3, "out", "700", "A2", null, false], // IDs diferentes: duas compras legítimas
      [4, null, null, "A3", "Valor inválido", false],
      [5, "in", "5000", null, null, false],
      [6, "in", "5000", null, null, true],  // igual e sem ID: precisa de revisão
    ]);
    expect(filePeriod(rows)).toEqual({ start: "2026-04-02", end: "2026-04-03" });
    const inverted = buildRows(table, guessMapping(table[0]), { header: true, invertSign: true });
    expect(inverted[0].direction).toBe("in");
  });
});
