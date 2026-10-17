// Money is always an integer number of cents held in a BigInt. It crosses the
// network as a decimal string ("12345" = R$ 123,45). Never use floating point.
export const MAX_CENTS = 99_999_999_999_999n; // R$ 999.999.999.999,99 — same limit as the database

/** Parses Brazilian input ("1.234,56", "-10", "R$ 0,5") into cents. Returns null if invalid. */
export function parseBRL(input: string): bigint | null {
  const raw = input.replace(/\s|R\$/g, "");
  const match = /^(-)?(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/.exec(raw);
  if (!match) return null;
  const [, sign, whole, fraction = ""] = match;
  const cents = BigInt(whole.replace(/\./g, "")) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (cents > MAX_CENTS) return null;
  return sign ? -cents : cents;
}

/** Strict parser for cents coming from the database/JSON as text. */
export function centsFromText(text: string): bigint {
  if (!/^-?\d{1,14}$/.test(text)) throw new Error("Valor monetário inválido");
  return BigInt(text);
}

/** Formats cents as "R$ 1.234,56" (negative as "-R$ 1.234,56"), without converting to float. */
export function formatBRL(cents: bigint): string {
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  const whole = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const fraction = (abs % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}R$ ${whole},${fraction}`;
}

/** Value for an input field: 123456n -> "1234,56". */
export function centsToInput(cents: bigint): string {
  return formatBRL(cents).replace(/^(-?)R\$ /, "$1").replace(/\./g, "");
}

export function sumCents(values: Iterable<bigint>): bigint {
  let total = 0n;
  for (const v of values) total += v;
  return total;
}

/**
 * Splits a total into n parts that add up exactly to the total; leftover cents go to the
 * first parts. R$ 100,00 in 3 → 33,34 + 33,33 + 33,33.
 */
export function splitCents(total: bigint, parts: number): bigint[] {
  if (!Number.isInteger(parts) || parts < 1) throw new Error("Quantidade de parcelas inválida");
  const n = BigInt(parts);
  const sign = total < 0n ? -1n : 1n;
  const abs = total * sign;
  const base = abs / n, remainder = abs % n;
  return Array.from({ length: parts }, (_, i) => (base + (BigInt(i) < remainder ? 1n : 0n)) * sign);
}
