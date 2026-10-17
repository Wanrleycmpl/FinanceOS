import { describe, expect, it } from "vitest";
import { centsFromText, centsToInput, formatBRL, MAX_CENTS, parseBRL, splitCents, sumCents } from "@/lib/money";
import { formatDateBR, isValidDateOnly, todayInBrazil } from "@/lib/dates";

describe("dinheiro em centavos", () => {
  it("lê valores no formato brasileiro", () => {
    expect(parseBRL("1.234,56")).toBe(123456n);
    expect(parseBRL("1234,5")).toBe(123450n);
    expect(parseBRL("R$ 0,01")).toBe(1n);
    expect(parseBRL("-10")).toBe(-1000n);
    expect(parseBRL("999.999.999.999,99")).toBe(MAX_CENTS);
  });
  it("recusa entradas ambíguas ou fora do limite", () => {
    for (const bad of ["", "abc", "1,234", "12.34", "1.23,00", "1000000000000,00", "1e5", "0,001"]) expect(parseBRL(bad), bad).toBeNull();
  });
  it("formata sem ponto flutuante", () => {
    expect(formatBRL(123456n)).toBe("R$ 1.234,56");
    expect(formatBRL(-5n)).toBe("-R$ 0,05");
    expect(formatBRL(MAX_CENTS)).toBe("R$ 999.999.999.999,99");
    expect(centsToInput(123456n)).toBe("1234,56");
    expect(centsToInput(-100n)).toBe("-1,00");
  });
  it("soma exatamente onde float erraria", () => {
    expect(sumCents([10n, 20n])).toBe(30n); // 0,10 + 0,20 = 0,30 exatos
    expect(sumCents(Array(3).fill(MAX_CENTS))).toBe(MAX_CENTS * 3n);
  });
  it("texto do banco é validado", () => {
    expect(centsFromText("-99999999999999")).toBe(-MAX_CENTS);
    expect(() => centsFromText("1.5")).toThrow();
  });
  it("R$ 100,00 em 3 parcelas fecha em 33,34 + 33,33 + 33,33", () => {
    const parts = splitCents(10000n, 3);
    expect(parts).toEqual([3334n, 3333n, 3333n]);
    expect(sumCents(parts)).toBe(10000n);
    expect(sumCents(splitCents(-10001n, 7))).toBe(-10001n);
    expect(() => splitCents(100n, 0)).toThrow();
  });
});

describe("datas financeiras", () => {
  it("usa o dia de Brasília", () => {
    expect(todayInBrazil(new Date("2026-10-17T02:30:00Z"))).toBe("2026-10-16"); // 23h30 em Brasília
  });
  it("valida datas reais", () => {
    expect(isValidDateOnly("2028-02-29")).toBe(true);
    expect(isValidDateOnly("2026-02-29")).toBe(false);
    expect(isValidDateOnly("17/10/2026")).toBe(false);
    expect(formatDateBR("2026-10-17")).toBe("17/10/2026");
  });
});
