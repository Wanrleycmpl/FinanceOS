// CSV for Excel/Google Sheets in Brazil: ";" separator, comma decimals, dd/mm/aaaa, UTF-8 with BOM.
import { formatDateBR } from "@/lib/dates";
import { centsToInput } from "@/lib/money";
import { NATURE_LABEL, STATUS_LABEL, type Nature, type Status } from "@/lib/transactions";

export type ExportRow = {
  date: string; description: string; nature: Nature; direction: "in" | "out"; category: string;
  account: string; toAccount: string; amount_cents: string; status: Status; hidden: boolean; excluded: boolean;
};

const cell = (v: string) => (/[";\n\r]/.test(v) || /^[=+\-@]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
// A leading = + - @ could run as a formula in spreadsheets; quoting plus a leading apostrophe prevents it.
const text = (v: string) => (/^[=+\-@]/.test(v) ? cell(`'${v}`) : cell(v));

export function transactionsToCsv(rows: ExportRow[]): string {
  const header = ["Data", "Descrição", "Tipo", "Categoria", "Conta", "Conta destino", "Valor (R$)", "Situação", "Oculto", "Fora dos relatórios"];
  const lines = rows.map(r => {
    const cents = BigInt(r.amount_cents);
    const signed = r.nature === "transfer" ? cents : r.direction === "in" ? cents : -cents; // card payment: money leaving the account
    return [
      formatDateBR(r.date), text(r.description), NATURE_LABEL[r.nature], text(r.category), text(r.account), text(r.toAccount),
      cell(centsToInput(signed)), STATUS_LABEL[r.status], r.hidden ? "sim" : "não", r.excluded ? "sim" : "não",
    ].join(";");
  });
  return "﻿" + [header.join(";"), ...lines].join("\r\n") + "\r\n";
}
