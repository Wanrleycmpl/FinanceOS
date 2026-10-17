// Reads bank CSV exports in the browser: detects the separator, parses quoted fields,
// maps columns and turns each line into a validated row. Money is converted from text
// straight to integer cents (never through floating point).
import { isValidDateOnly } from "@/lib/dates";
import { MAX_CENTS } from "@/lib/money";

export const MAX_FILE_BYTES = 1_000_000;
export const MAX_ROWS = 1000;

export function normalizeText(text: string): string {
  return text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
}

export function detectDelimiter(text: string): ";" | "," | "\t" {
  const first = text.split("\n").find(l => l.trim()) ?? "";
  const outside = first.replace(/"[^"]*"/g, "");
  const counts = { ";": outside.split(";").length, ",": outside.split(",").length, "\t": outside.split("\t").length } as const;
  return (Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]) as ";" | "," | "\t";
}

/** RFC 4180-style parser: quotes, "" escapes and line breaks inside quotes. Blank lines are dropped. */
export function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === "") quoted = true;
    else if (c === delimiter) { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(v => v.trim() !== ""));
}

/** "31/12/2026", "31-12-2026", "31/12/26" or "2026-12-31" → "2026-12-31". */
export function parseDate(value: string): string | null {
  const v = value.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (m) return isValidDateOnly(`${m[1]}-${m[2]}-${m[3]}`) ? `${m[1]}-${m[2]}-${m[3]}` : null;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(v);
  if (!m) return null;
  const year = m[3].length === 2 ? `20${m[3]}` : m[3];
  const iso = `${year}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return isValidDateOnly(iso) ? iso : null;
}

/**
 * Signed cents from bank formats: "1.234,56", "-12,34", "R$ -12,34", "(12,34)", "12,34-", "-12.34", "1234".
 * Returns null if ambiguous or above the limit.
 */
export function parseAmount(value: string): bigint | null {
  let v = value.replace(/R\$|\s| /g, "");
  let negative = false;
  if (/^\(.*\)$/.test(v)) { negative = true; v = v.slice(1, -1); }
  if (v.endsWith("-")) { negative = true; v = v.slice(0, -1); }
  if (v.startsWith("-")) { negative = !negative; v = v.slice(1); }
  else if (v.startsWith("+")) v = v.slice(1);
  let whole: string, fraction = "";
  if (/^\d{1,3}(\.\d{3})*,\d{1,2}$|^\d+,\d{1,2}$/.test(v)) [whole, fraction] = [v.split(",")[0].replace(/\./g, ""), v.split(",")[1]];
  else if (/^\d+\.\d{1,2}$/.test(v)) [whole, fraction] = v.split(".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(v)) whole = v.replace(/\./g, "");
  else if (/^\d+$/.test(v)) whole = v;
  else return null;
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (cents > MAX_CENTS) return null;
  return negative ? -cents : cents;
}

export type Mapping = { date: number; description: number; amount: number; externalId: number | null };

const NAMES: Record<keyof Mapping, RegExp> = {
  date: /^(data|date|dt)/i,
  description: /(descri|hist[oó]rico|lan[cç]amento|memo|estabelecimento|title|t[ií]tulo)/i,
  amount: /^(valor|amount|value|quantia)/i,
  externalId: /(identificador|^id$|fitid|documento|n[uú]mero|transa[cç][aã]o)/i,
};

/** Guesses columns from the header row (e.g. Nubank: Data, Valor, Identificador, Descrição). */
export function guessMapping(header: string[]): Mapping {
  const find = (re: RegExp, skip: number[] = []) => header.findIndex((h, i) => !skip.includes(i) && re.test(h.trim()));
  const date = find(NAMES.date), amount = find(NAMES.amount);
  const description = find(NAMES.description, [date, amount]);
  const externalId = find(NAMES.externalId, [date, amount, description]);
  return {
    date: date >= 0 ? date : 0,
    description: description >= 0 ? description : Math.min(1, header.length - 1),
    amount: amount >= 0 ? amount : Math.min(2, header.length - 1),
    externalId: externalId >= 0 ? externalId : null,
  };
}

export type ParsedRow = {
  line: number; // line number in the file (1 = first line)
  date: string | null;
  description: string;
  amount_cents: string | null; // positive cents
  direction: "in" | "out" | null;
  external_id: string | null;
  error: string | null;
  repeatedInFile: boolean; // same date/amount/direction/description as an earlier line, without distinct IDs
};

export const duplicateKey = (r: { date: string | null; amount_cents: string | null; direction: string | null; description: string }) =>
  `${r.date}|${r.amount_cents}|${r.direction}|${r.description.trim().toLowerCase().replace(/\s+/g, " ")}`;

export function buildRows(table: string[][], mapping: Mapping, options: { header: boolean; invertSign: boolean }): ParsedRow[] {
  const start = options.header ? 1 : 0;
  const rows = table.slice(start).map((cells, i): ParsedRow => {
    const date = parseDate(cells[mapping.date] ?? "");
    const description = (cells[mapping.description] ?? "").trim().replace(/\s+/g, " ").slice(0, 140);
    let amount = parseAmount(cells[mapping.amount] ?? "");
    if (amount !== null && options.invertSign) amount = -amount;
    const externalRaw = mapping.externalId === null ? "" : (cells[mapping.externalId] ?? "").trim();
    const error = !date ? "Data inválida" : description.length < 2 ? "Descrição vazia" : amount === null ? "Valor inválido" : amount === 0n ? "Valor zero" : externalRaw.length > 120 ? "ID externo longo demais" : null;
    return {
      line: i + start + 1,
      date,
      description,
      amount_cents: amount === null || amount === 0n ? null : (amount < 0n ? -amount : amount).toString(),
      direction: amount === null || amount === 0n ? null : amount < 0n ? "out" : "in",
      external_id: externalRaw || null,
      error,
      repeatedInFile: false,
    };
  });
  // Equal lines are suspicious only when no distinct bank ID tells them apart.
  const seen = new Map<string, ParsedRow>();
  for (const r of rows) {
    if (r.error) continue;
    const key = duplicateKey(r);
    const earlier = seen.get(key);
    if (earlier && (!r.external_id || !earlier.external_id || r.external_id === earlier.external_id)) r.repeatedInFile = true;
    else if (!earlier) seen.set(key, r);
  }
  return rows;
}

/** First and last valid date in the file: the period the statement covers. */
export function filePeriod(rows: ParsedRow[]): { start: string; end: string } | null {
  const dates = rows.filter(r => !r.error && r.date).map(r => r.date!).sort();
  return dates.length ? { start: dates[0], end: dates[dates.length - 1] } : null;
}
