"use client";
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { checkImport, importCsv, type CheckResult } from "@/app/actions/import";
import { Badge, Button, buttonVariants, Card, Field, FormMessage, Select } from "@/components/ui";
import { buildRows, detectDelimiter, filePeriod, guessMapping, MAX_FILE_BYTES, MAX_ROWS, normalizeText, parseCsv, type Mapping, type ParsedRow } from "@/lib/csv-import";
import { formatDateBR } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { cn } from "@/lib/utils";

type LoadedFile = { name: string; hash: string; table: string[][] };

async function readFile(file: File): Promise<LoadedFile> {
  if (file.size > MAX_FILE_BYTES) throw new Error("O arquivo passa de 1 MB. Divida-o em partes menores.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  let text: string;
  // Many Brazilian banks still export in Windows-1252 (Latin-1) instead of UTF-8.
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { text = new TextDecoder("windows-1252").decode(bytes); }
  text = normalizeText(text);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  const hash = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
  const table = parseCsv(text, detectDelimiter(text));
  if (table.length < 1) throw new Error("O arquivo está vazio.");
  if (table.length > MAX_ROWS + 1) throw new Error(`O arquivo tem mais de ${MAX_ROWS} linhas. Divida-o em partes menores.`);
  return { name: file.name, hash, table };
}

type RowState = "error" | "external_exists" | "possible_duplicate" | "repeated" | "ok";
const STATE_LABEL: Record<RowState, string> = {
  error: "Com erro",
  external_exists: "Já importada",
  possible_duplicate: "Possível duplicata",
  repeated: "Repetida no arquivo",
  ok: "Nova",
};

export function CsvImporter({ accounts, today }: { accounts: { id: string; label: string }[]; today: string }) {
  const [account, setAccount] = useState(accounts[0]?.id ?? "");
  const [file, setFile] = useState<LoadedFile | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [header, setHeader] = useState(true);
  const [invert, setInvert] = useState(false);
  const [overrides, setOverrides] = useState<Map<number, boolean>>(new Map());
  const [check, setCheck] = useState<{ key: string; result: CheckResult } | null>(null);
  const [outcome, setOutcome] = useState<{ error?: string; imported?: number } | null>(null);
  const [pending, startTransition] = useTransition();

  const rows: ParsedRow[] = useMemo(() => (file && mapping ? buildRows(file.table, mapping, { header, invertSign: invert }) : []), [file, mapping, header, invert]);
  const period = filePeriod(rows);
  const checkKey = file && account ? `${account}|${file.hash}|${JSON.stringify(mapping)}|${header}|${invert}` : "";
  const result = check?.key === checkKey ? check.result : null;

  // Compare with saved transactions whenever the file, account or mapping changes.
  useEffect(() => {
    if (!checkKey || !file) return;
    let alive = true;
    const valid = rows.map((r, index) => ({ r, index })).filter(({ r }) => !r.error);
    checkImport({
      account, hash: file.hash,
      rows: valid.map(({ r, index }) => ({ index, date: r.date!, description: r.description, amount_cents: r.amount_cents!, direction: r.direction!, external_id: r.external_id })),
    }).then(res => { if (alive) setCheck({ key: checkKey, result: res }); });
    return () => { alive = false; };
  }, [checkKey, rows, account, file]);

  const stateOf = (r: ParsedRow, i: number): RowState =>
    r.error ? "error" : result?.flags?.[i] ?? (r.repeatedInFile ? "repeated" : "ok");
  const selectable = (s: RowState) => s !== "error" && s !== "external_exists";
  const isSelected = (r: ParsedRow, i: number) => {
    const s = stateOf(r, i);
    if (!selectable(s)) return false;
    return overrides.get(i) ?? s === "ok"; // duplicates start unchecked: you decide after reviewing
  };
  const selected = rows.filter(isSelected);
  const counts = rows.reduce<Record<RowState, number>>((acc, r, i) => { acc[stateOf(r, i)]++; return acc; }, { error: 0, external_exists: 0, possible_duplicate: 0, repeated: 0, ok: 0 });

  const resetReview = () => { setOverrides(new Map()); setOutcome(null); };

  async function onFile(f: File | undefined) {
    setFileError(null); setFile(null); setMapping(null); resetReview();
    if (!f) return;
    try {
      const loaded = await readFile(f);
      setFile(loaded);
      setMapping(guessMapping(loaded.table[0]));
    } catch (e) {
      setFileError(e instanceof Error ? e.message : "Não foi possível ler o arquivo.");
    }
  }

  function submit() {
    if (!file || !period) return;
    startTransition(async () => {
      const res = await importCsv({
        account, fileName: file.name, hash: file.hash, periodStart: period.start, periodEnd: period.end,
        rows: selected.map(r => ({ date: r.date!, description: r.description, amount_cents: r.amount_cents!, direction: r.direction!, external_id: r.external_id })),
      });
      setOutcome(res);
    });
  }

  if (outcome?.imported !== undefined && period) {
    return (
      <Card className="grid justify-items-start gap-3">
        <FormMessage state={{ ok: `${outcome.imported} lançamento(s) importado(s). Os dias de ${formatDateBR(period.start)} a ${formatDateBR(period.end)} desta conta agora contam como cobertos por extrato.` }} />
        <p className="text-sm text-muted">Os lançamentos entram sem categoria. Para classificar, use Editar em cada um, na tela Transações.</p>
        <div className="flex flex-wrap gap-2">
          <Link href={`/transacoes?mes=${period.end.slice(0, 7)}`} className={buttonVariants()}>Ver transações</Link>
          <Button variant="secondary" onClick={() => { setFile(null); setMapping(null); resetReview(); }}>Importar outro arquivo</Button>
        </div>
      </Card>
    );
  }

  const columns = file?.table[0] ?? [];
  const colOptions = columns.map((c, i) => <option key={i} value={i}>{header ? c || `Coluna ${i + 1}` : `Coluna ${i + 1} (ex.: ${c.slice(0, 20)})`}</option>);

  return (
    <div className="grid gap-6">
      <Card className="grid gap-4">
        <h2 className="font-medium">1. Conta e arquivo</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Conta de destino" htmlFor="account" hint="Todos os lançamentos do arquivo vão para esta conta.">
            <Select id="account" value={account} onChange={e => { setAccount(e.target.value); resetReview(); }}>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
            </Select>
          </Field>
          <Field label="Arquivo CSV do banco" htmlFor="file" hint="Até 1 MB e 1.000 linhas. O arquivo é lido no seu navegador.">
            <input id="file" type="file" accept=".csv,text/csv,text/plain" onChange={e => onFile(e.target.files?.[0])}
              className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border file:border-line file:bg-surface-2 file:px-3 file:py-2 file:text-ink" />
          </Field>
        </div>
        {fileError && <FormMessage state={{ error: fileError }} />}
        {accounts.length === 0 && <p className="text-sm text-warning">Cadastre uma conta antes de importar.</p>}
      </Card>

      {file && mapping && (
        <Card className="grid gap-4">
          <h2 className="font-medium">2. Colunas</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {(["date", "description", "amount"] as const).map(key => (
              <Field key={key} label={{ date: "Data", description: "Descrição", amount: "Valor (com sinal)" }[key]} htmlFor={`map-${key}`}>
                <Select id={`map-${key}`} value={mapping[key]} onChange={e => { setMapping({ ...mapping, [key]: Number(e.target.value) }); resetReview(); }}>{colOptions}</Select>
              </Field>
            ))}
            <Field label="ID do banco (opcional)" htmlFor="map-external" hint="Evita duplicar quando o mesmo lançamento aparece em outro arquivo.">
              <Select id="map-external" value={mapping.externalId ?? ""} onChange={e => { setMapping({ ...mapping, externalId: e.target.value === "" ? null : Number(e.target.value) }); resetReview(); }}>
                <option value="">Não usar</option>{colOptions}
              </Select>
            </Field>
          </div>
          <div className="flex flex-wrap gap-6 text-sm">
            <label className="inline-flex items-center gap-2"><input type="checkbox" className="accent-brand" checked={header} onChange={e => { setHeader(e.target.checked); resetReview(); }} />A primeira linha é cabeçalho</label>
            <label className="inline-flex items-center gap-2"><input type="checkbox" className="accent-brand" checked={invert} onChange={e => { setInvert(e.target.checked); resetReview(); }} />Inverter sinal (o banco mostra gastos como positivos)</label>
          </div>
          <p className="text-xs text-muted">Valor negativo = despesa; positivo = receita. Transferências entre suas contas não são detectadas automaticamente: depois de importar, ajuste-as em Transações.</p>
        </Card>
      )}

      {file && rows.length > 0 && (
        <Card className="grid gap-4 p-0">
          <div className="grid gap-2 px-5 pt-5">
            <h2 className="font-medium">3. Revisão</h2>
            {result?.alreadyImported ? (
              <FormMessage state={{ error: "Este arquivo já foi importado nesta conta. Nada será gravado de novo." }} />
            ) : result?.error ? (
              <FormMessage state={{ error: result.error }} />
            ) : !result ? (
              <p role="status" className="text-sm text-muted">Comparando com seus lançamentos…</p>
            ) : (
              <p className="text-sm text-muted">
                {counts.ok} novas · {counts.possible_duplicate} possíveis duplicatas · {counts.repeated} repetidas no arquivo · {counts.external_exists} já importadas · {counts.error} com erro.
                {(counts.possible_duplicate > 0 || counts.repeated > 0) && " Possíveis duplicatas começam desmarcadas: duas compras iguais podem ser legítimas, então marque as que realmente aconteceram."}
              </p>
            )}
            {period && <p className="text-xs text-muted">Período do arquivo: {formatDateBR(period.start)} a {formatDateBR(period.end)}. Esses dias passam a contar como “cobertos por extrato” nesta conta.{period.end > today && " Linhas com data futura entram como pendentes."}</p>}
          </div>
          <div className="max-h-[28rem] overflow-auto border-t border-line">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface text-left text-xs text-muted">
                <tr><th className="px-3 py-2 font-medium"><span className="sr-only">Importar</span></th><th className="px-3 py-2 font-medium">Linha</th><th className="px-3 py-2 font-medium">Data</th><th className="px-3 py-2 font-medium">Descrição</th><th className="px-3 py-2 text-right font-medium">Valor</th><th className="px-3 py-2 font-medium">Situação</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r, i) => {
                  const s = stateOf(r, i);
                  return (
                    <tr key={i} className={cn(!isSelected(r, i) && "text-muted")}>
                      <td className="px-3 py-2">
                        <input type="checkbox" className="accent-brand" aria-label={`Importar linha ${r.line}`} disabled={!selectable(s) || !result || result.alreadyImported}
                          checked={isSelected(r, i)} onChange={e => setOverrides(new Map(overrides).set(i, e.target.checked))} />
                      </td>
                      <td className="tabular px-3 py-2">{r.line}</td>
                      <td className="tabular whitespace-nowrap px-3 py-2">{r.date ? formatDateBR(r.date) : "—"}</td>
                      <td className="px-3 py-2">{r.description || "—"}{r.external_id && <span className="block text-xs text-muted">ID {r.external_id}</span>}</td>
                      <td className="tabular whitespace-nowrap px-3 py-2 text-right">{r.amount_cents ? `${r.direction === "in" ? "+" : "−"}${formatBRL(BigInt(r.amount_cents))}` : "—"}</td>
                      <td className="px-3 py-2"><Badge className={cn(s === "error" && "border-danger/40 text-danger", (s === "possible_duplicate" || s === "repeated") && "border-warning/40 text-warning")}>{r.error ?? STATE_LABEL[s]}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="grid gap-3 px-5 pb-5">
            {outcome?.error && <FormMessage state={{ error: outcome.error }} />}
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={submit} disabled={pending || !result || Boolean(result.error) || Boolean(result.alreadyImported) || !period}>
                {pending ? "Importando…" : selected.length ? `Importar ${selected.length} lançamento(s)` : "Registrar só a cobertura do período"}
              </Button>
              <p className="text-xs text-muted">Tudo ou nada: se algo falhar, nenhuma linha é gravada.</p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
