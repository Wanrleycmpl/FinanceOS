// Credit cards and statements (migration 20261017210000_cartoes), run in PGlite.
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createDb } from "./helpers/pg";

const A = "00000000-0000-0000-0000-0000000000a3";
const B = "00000000-0000-0000-0000-0000000000b3";
let db: PGlite;
let as: Awaited<ReturnType<typeof createDb>>["as"];
let acc: string, card: string, accB: string, cardB: string, fee: string, market: string;
const fails = (p: Promise<unknown>) => expect(p).rejects.toThrow();

type Tx = Record<string, string | null>;
async function insert(user: string, t: Tx): Promise<string> {
  const cols = Object.keys(t);
  return as(user, async () => (await db.query<{ id: string }>(
    `insert into public.transactions (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")}) returning id`, Object.values(t))).rows[0].id);
}
const purchase = (extra: Tx = {}) => ({ nature: "expense", direction: "out", card_id: card, description: "Compra no cartão", amount_cents: "20000", date: "2026-03-05", ...extra });
const overview = (user: string) => as(user, async () => (await db.query<{ card_id: string; limit_cents: string; committed_cents: string; available_cents: string }>("select * from public.card_overview()")).rows);
const statements = (user: string, c: string) => as(user, async () => (await db.query<Record<string, string>>("select statement_month::text, purchases_cents, fees_cents, credits_cents, paid_cents, pending_payments_cents from public.card_statements($1)", [c])).rows);
const balance = async (id: string) => (await as(A, () => db.query<{ account_id: string; balance_cents: string }>("select * from public.account_balances()"))).rows.find(r => r.account_id === id)?.balance_cents;
const summary = async () => (await as(A, () => db.query<{ s: Record<string, string> }>("select public.transaction_summary('2026-03-01', '2026-03-31') as s"))).rows[0].s;

beforeAll(async () => {
  ({ db, as } = await createDb());
  await db.query("insert into auth.users(id) values ($1), ($2)", [A, B]);
  const one = async (user: string, sql: string, params: unknown[] = []) => as(user, async () => (await db.query<{ id: string }>(sql, params)).rows[0].id);
  acc = await one(A, "select public.save_account(null, 'Banco Teste', 'Corrente', 'checking', 100000, '2026-01-01') as id");
  card = await one(A, "select public.save_card(null, 'Banco Teste', 'Cartão Roxo', '1234', 500000, 10, 20) as id");
  accB = await one(B, "select public.save_account(null, 'Banco B', 'Conta B', 'checking', 0, '2026-01-01') as id");
  cardB = await one(B, "select public.save_card(null, 'Banco B', 'Cartão B', null, 100000, 5, 15) as id");
  fee = (await db.query<{ id: string }>("select id from public.categories where owner_id = $1 and template_key = 'financas.02'", [A])).rows[0].id;
  market = (await db.query<{ id: string }>("select id from public.categories where owner_id = $1 and template_key = 'alimentacao.05'", [A])).rows[0].id;
}, 60_000);

describe("cartões e faturas", () => {
  it("calcula a fatura pela data de fechamento, inclusive em meses curtos", async () => {
    const f = async (d: string, close: number) => (await db.query<{ m: string }>("select public.statement_for($1, $2)::text as m", [d, close])).rows[0].m;
    expect(await f("2026-03-09", 10)).toBe("2026-03-01");
    expect(await f("2026-03-10", 10)).toBe("2026-04-01"); // no dia do fechamento já vai para a próxima
    expect(await f("2026-02-27", 31)).toBe("2026-02-01"); // fevereiro fecha no dia 28
    expect(await f("2026-02-28", 31)).toBe("2026-03-01");
    expect(await f("2026-12-15", 10)).toBe("2027-01-01");
  });

  let buy: string;
  it("compra no cartão conta como gasto, não mexe no saldo da conta e compromete o limite", async () => {
    buy = await insert(A, purchase({ category_id: market }));
    const row = (await db.query<{ statement_month: string; account_id: string | null }>("select statement_month::text, account_id from public.transactions where id = $1", [buy])).rows[0];
    expect(row).toEqual({ statement_month: "2026-03-01", account_id: null });
    expect(await balance(acc)).toBe("100000");
    expect((await summary()).expense).toBe("20000");
    expect((await overview(A))[0]).toMatchObject({ limit_cents: "500000", committed_cents: "20000", available_cents: "480000" });
  });

  it("exige um único meio: conta ou cartão; receita no cartão não existe", async () => {
    await fails(insert(A, purchase({ account_id: acc })));
    await fails(insert(A, { nature: "income", direction: "in", card_id: card, description: "Receita", amount_cents: "1", date: "2026-03-05" }));
    await fails(insert(A, { nature: "transfer", direction: "out", account_id: acc, to_account_id: null, card_id: card, description: "x", amount_cents: "1", date: "2026-03-05" }));
  });

  it("estorno no cartão vira crédito na fatura; estorno da compra do cartão na conta é recusado", async () => {
    await fails(insert(A, { nature: "refund", direction: "in", account_id: acc, refund_of: buy, description: "Estorno", amount_cents: "1000", date: "2026-03-06" }));
    await insert(A, { nature: "refund", direction: "in", card_id: card, refund_of: buy, description: "Estorno", amount_cents: "5000", date: "2026-03-12" });
    expect((await statements(A, card)).find(s => s.statement_month === "2026-04-01")?.credits_cents).toBe("5000"); // depois do fechamento
    expect((await overview(A))[0].committed_cents).toBe("15000");
  });

  it("pagamento de fatura reduz caixa e dívida sem contar a compra de novo", async () => {
    await fails(insert(A, { nature: "card_payment", direction: "out", account_id: acc, card_id: card, description: "Pagamento", amount_cents: "1", date: "2026-03-20" })); // sem fatura
    await fails(insert(A, { nature: "card_payment", direction: "out", account_id: acc, card_id: card, statement_month: "2026-03-01", category_id: market, description: "Pagamento", amount_cents: "1", date: "2026-03-20" }));
    await insert(A, { nature: "card_payment", direction: "out", account_id: acc, card_id: card, statement_month: "2026-03-01", description: "Pagamento fatura março", amount_cents: "15000", date: "2026-03-20" });
    expect(await balance(acc)).toBe("85000");
    const s = await summary();
    expect([s.expense, s.income]).toEqual(["20000", "0"]); // pagamento não é despesa
    expect((await overview(A))[0].committed_cents).toBe("0");
    const march = (await statements(A, card)).find(x => x.statement_month === "2026-03-01");
    expect(march).toMatchObject({ purchases_cents: "20000", paid_cents: "15000" });
  });

  it("lançamento futuro (parcela) compromete o limite; encargos aparecem separados", async () => {
    await fails(insert(A, purchase({ date: "2199-01-05" }))); // futuro liquidado
    await insert(A, purchase({ date: "2199-01-05", status: "pending", amount_cents: "30000" }));
    await insert(A, purchase({ date: "2026-03-07", category_id: fee, amount_cents: "1234", description: "Juros" }));
    expect((await overview(A))[0]).toMatchObject({ committed_cents: "31234", available_cents: "468766" });
    expect((await statements(A, card)).find(x => x.statement_month === "2026-03-01")?.fees_cents).toBe("1234");
  });

  it("cartão arquivado: sem compras novas, mas a fatura ainda pode ser paga", async () => {
    await as(A, () => db.query("update public.credit_cards set archived_at = now() where id = $1", [card]));
    await fails(insert(A, purchase()));
    await insert(A, { nature: "card_payment", direction: "out", account_id: acc, card_id: card, statement_month: "2026-03-01", description: "Pagamento", amount_cents: "1234", date: "2026-03-21" });
    await as(A, () => db.query("update public.credit_cards set archived_at = null where id = $1", [card]));
  });

  it("isola usuários nos cartões", async () => {
    expect((await overview(B)).map(o => o.card_id)).toEqual([cardB]);
    expect(await statements(B, card)).toEqual([]);
    expect((await as(B, () => db.query("select id from public.credit_cards where id = $1", [card]))).rows).toEqual([]);
    await fails(insert(B, { nature: "expense", direction: "out", card_id: card, description: "Invasão", amount_cents: "1", date: "2026-03-05" }));
    await fails(insert(B, { nature: "card_payment", direction: "out", account_id: accB, card_id: card, statement_month: "2026-03-01", description: "Invasão", amount_cents: "1", date: "2026-03-05" }));
    expect((await as(B, () => db.query("update public.credit_cards set limit_cents = 1 where id = $1 returning id", [card]))).rows).toEqual([]);
    await fails(as(B, () => db.query("select public.save_card($1, 'X', 'Invasão', null, 1, 1, 1)", [card])));
    await fails(as(null, () => db.query("select * from public.credit_cards")));
  });
});
