// CSV import batches, coverage and dashboard totals (migration 20261017180000), run in PGlite.
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createDb } from "./helpers/pg";

const A = "00000000-0000-0000-0000-0000000000a2";
const B = "00000000-0000-0000-0000-0000000000b2";
const HASH1 = "a".repeat(64), HASH2 = "b".repeat(64), HASH3 = "c".repeat(64);
let db: PGlite;
let as: Awaited<ReturnType<typeof createDb>>["as"];
let acc: string, cash: string, accB: string, market: string, bakery: string, salary: string;
const fails = (p: Promise<unknown>) => expect(p).rejects.toThrow();

type Row = { description: string; amount_cents: string; direction: "in" | "out"; date: string; external_id?: string | null };
const importRows = (user: string, account: string, hash: string, start: string, end: string, rows: Row[]) =>
  as(user, async () => (await db.query<{ n: number }>("select public.import_transactions($1, 'extrato.csv', $2, $3, $4, $5::jsonb) as n",
    [account, hash, start, end, JSON.stringify(rows)])).rows[0].n);
const count = (user: string) => as(user, async () => (await db.query<{ n: number }>("select count(*)::int as n from public.transactions")).rows[0].n);
const days = (user: string, account: string | null) => as(user, async () => (await db.query<{ day: string; expense_cents: string; has_records: boolean; covered: boolean }>(
  "select day::text, expense_cents, has_records, covered from public.daily_spending('2026-04-01', '2026-04-05', $1)", [account])).rows);

beforeAll(async () => {
  ({ db, as } = await createDb());
  await db.query("insert into auth.users(id) values ($1), ($2)", [A, B]);
  const account = (user: string, name: string, kind = "checking") => as(user, async () => (await db.query<{ id: string }>(
    "select public.save_account(null, 'Banco Teste', $1, $2, 0, '2026-01-01') as id", [name, kind])).rows[0].id);
  acc = await account(A, "Corrente");
  cash = await account(A, "Carteira", "cash");
  accB = await account(B, "Conta B");
  const cat = async (key: string) => (await db.query<{ id: string }>("select id from public.categories where owner_id = $1 and template_key = $2", [A, key])).rows[0].id;
  market = await cat("alimentacao.05"); bakery = await cat("alimentacao.06"); salary = await cat("renda.01");
}, 60_000);

describe("importação de CSV", () => {
  it("importa o lote inteiro: sinal vira receita/despesa e o ID externo fica guardado", async () => {
    const n = await importRows(A, acc, HASH1, "2026-04-01", "2026-04-03", [
      { description: "Salário", amount_cents: "500000", direction: "in", date: "2026-04-01", external_id: "X1" },
      { description: "Café", amount_cents: "700", direction: "out", date: "2026-04-02", external_id: "X2" },
      { description: "Café", amount_cents: "700", direction: "out", date: "2026-04-02", external_id: "X3" }, // compra igual, legítima
    ]);
    expect(n).toBe(3);
    const rows = await as(A, async () => (await db.query<{ nature: string; external_id: string; amount_cents: string; import_batch_id: string | null }>(
      "select nature, external_id, amount_cents, import_batch_id from public.transactions_read order by external_id")).rows);
    expect(rows.map(r => [r.nature, r.external_id, r.amount_cents])).toEqual([["income", "X1", "500000"], ["expense", "X2", "700"], ["expense", "X3", "700"]]);
    expect(rows.every(r => r.import_batch_id)).toBe(true);
  });

  it("o mesmo arquivo não entra de novo; ID externo repetido derruba o lote inteiro", async () => {
    await fails(importRows(A, acc, HASH1, "2026-04-01", "2026-04-03", [{ description: "Outra", amount_cents: "1", direction: "out", date: "2026-04-02" }]));
    await fails(importRows(A, acc, HASH2, "2026-04-02", "2026-04-04", [
      { description: "Nova", amount_cents: "100", direction: "out", date: "2026-04-04", external_id: "X9" },
      { description: "Café", amount_cents: "700", direction: "out", date: "2026-04-02", external_id: "X2" },
    ]));
    expect(await count(A)).toBe(3); // nada parcial
    await fails(importRows(A, acc, HASH2, "2026-04-02", "2026-04-03", [{ description: "Fora", amount_cents: "1", direction: "out", date: "2026-04-05" }]));
  });

  it("lote vazio registra só a cobertura (todas as linhas já existiam)", async () => {
    expect(await importRows(A, acc, HASH2, "2026-04-03", "2026-04-04", [])).toBe(0);
    expect(await count(A)).toBe(3);
  });

  it("respeita as regras de conta e isola usuários", async () => {
    await fails(importRows(B, acc, HASH3, "2026-04-01", "2026-04-01", [{ description: "Invasão", amount_cents: "1", direction: "out", date: "2026-04-01" }]));
    await fails(importRows(A, acc, HASH3, "2025-12-31", "2025-12-31", [{ description: "Antes do saldo", amount_cents: "1", direction: "out", date: "2025-12-31" }]));
    expect(await as(B, async () => (await db.query("select * from public.import_batches")).rows)).toEqual([]);
    await fails(as(A, () => db.query("update public.transactions set external_id = 'Z' where account_id = $1", [acc])));
    await fails(as(null, () => db.query("select * from public.import_batches")));
    expect(await importRows(B, accB, HASH1, "2026-04-01", "2026-04-01", [{ description: "Mesmo hash, outra pessoa", amount_cents: "1", direction: "out", date: "2026-04-01" }])).toBe(1);
  });
});

describe("dados do painel", () => {
  it("separa dia com gasto, dia coberto sem gasto e dia sem cobertura", async () => {
    // Conta corrente coberta de 01 a 04/04; dia 05 não coberto.
    const d = await days(A, acc);
    expect(d.map(x => [x.day, x.expense_cents, x.has_records, x.covered])).toEqual([
      ["2026-04-01", "0", false, true],     // só receita: sem gasto confirmado
      ["2026-04-02", "1400", true, true],
      ["2026-04-03", "0", false, true],
      ["2026-04-04", "0", false, true],
      ["2026-04-05", "0", false, false],    // sem cobertura: não é zero confirmado
    ]);
    // Todas as contas: a carteira nunca foi importada, então nenhum dia é coberto.
    expect((await days(A, null)).every(x => !x.covered)).toBe(true);
  });

  it("estorno reduz o dia e a categoria; cada lançamento soma uma vez", async () => {
    const ins = (sql: string, params: unknown[]) => as(A, () => db.query(sql, params));
    const p = await as(A, async () => (await db.query<{ id: string }>(
      "insert into public.transactions (nature, direction, account_id, category_id, description, amount_cents, date) values ('expense','out',$1,$2,'Mercado',10000,'2026-04-03') returning id", [cash, market])).rows[0].id);
    await ins("insert into public.transactions (nature, direction, account_id, refund_of, description, amount_cents, date) values ('refund','in',$1,$2,'Estorno',2500,'2026-04-04')", [cash, p]);
    await ins("insert into public.transactions (nature, direction, account_id, category_id, description, amount_cents, date) values ('expense','out',$1,$2,'Pão',1234,'2026-04-03')", [cash, bakery]);
    await ins("insert into public.transactions (nature, direction, account_id, category_id, description, amount_cents, date) values ('income','in',$1,$2,'Salário',1,'2026-04-03')", [cash, salary]);
    await ins("insert into public.transactions (nature, direction, account_id, to_account_id, description, amount_cents, date) values ('transfer','out',$1,$2,'Transferência',99999,'2026-04-03')", [cash, acc]);
    const d = await days(A, cash);
    expect(d.find(x => x.day === "2026-04-03")?.expense_cents).toBe("11234");
    expect(d.find(x => x.day === "2026-04-04")?.expense_cents).toBe("-2500");
    const totals = await as(A, async () => (await db.query<{ category_id: string | null; side: string; total_cents: string }>(
      "select category_id, side, total_cents from public.category_totals('2026-04-01', '2026-04-30', null)")).rows);
    const get = (id: string | null, side: string) => totals.find(t => t.category_id === id && t.side === side)?.total_cents;
    expect(get(market, "expense")).toBe("7500");
    expect(get(bakery, "expense")).toBe("1234");
    expect(get(salary, "income")).toBe("1");
    expect(get(null, "expense")).toBe("1400"); // cafés importados sem categoria
    expect(get(null, "income")).toBe("500000");
    expect(totals.some(t => t.total_cents === "99999")).toBe(false); // transferência fora
  });
});
