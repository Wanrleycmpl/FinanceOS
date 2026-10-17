// Transaction rules in the database (migration 20261017150000_transacoes), run in PGlite.
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createDb } from "./helpers/pg";

const A = "00000000-0000-0000-0000-0000000000a1";
const B = "00000000-0000-0000-0000-0000000000b1";
let db: PGlite;
let as: Awaited<ReturnType<typeof createDb>>["as"];
let acc1: string, acc2: string, accB: string, market: string, salary: string, catB: string;
const fails = (p: Promise<unknown>) => expect(p).rejects.toThrow();

type Tx = { nature: string; direction: string; account_id: string; amount_cents: string; date?: string; description?: string; to_account_id?: string | null; category_id?: string | null; refund_of?: string | null; status?: string };
async function insert(user: string, t: Tx): Promise<string> {
  return as(user, async () => (await db.query<{ id: string }>(
    `insert into public.transactions (nature, direction, account_id, to_account_id, category_id, refund_of, description, amount_cents, date, status)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id`,
    [t.nature, t.direction, t.account_id, t.to_account_id ?? null, t.category_id ?? null, t.refund_of ?? null, t.description ?? "Lançamento teste", t.amount_cents, t.date ?? "2026-03-10", t.status ?? "settled"],
  )).rows[0].id);
}
const balances = (user: string) => as(user, async () => Object.fromEntries((await db.query<{ account_id: string; balance_cents: string; pending_cents: string }>(
  "select * from public.account_balances()")).rows.map(r => [r.account_id, [r.balance_cents, r.pending_cents]])));
const summary = (user: string, extra = "") => as(user, async () => (await db.query<{ s: Record<string, string> }>(
  `select public.transaction_summary('2026-03-01', '2026-03-31'${extra}) as s`)).rows[0].s);
const update = (user: string, id: string, set: string) => as(user, () => db.query(`update public.transactions set ${set} where id = $1 returning id`, [id]));

beforeAll(async () => {
  ({ db, as } = await createDb());
  await db.query("insert into auth.users(id) values ($1), ($2)", [A, B]);
  const account = (user: string, name: string, cents: string) => as(user, async () => (await db.query<{ id: string }>(
    "select public.save_account(null, 'Banco Teste', $1, 'checking', $2, '2026-01-01') as id", [name, cents])).rows[0].id);
  acc1 = await account(A, "Conta 1", "100000");
  acc2 = await account(A, "Conta 2", "0");
  accB = await account(B, "Conta B", "0");
  const cat = async (user: string, key: string) => (await db.query<{ id: string }>("select id from public.categories where owner_id = $1 and template_key = $2", [user, key])).rows[0].id;
  market = await cat(A, "alimentacao.05");
  salary = await cat(A, "renda.01");
  catB = await cat(B, "alimentacao.05");
}, 60_000);

describe("transações", () => {
  let purchase: string;

  it("receita e despesa mudam saldo e indicadores com centavos exatos", async () => {
    await insert(A, { nature: "income", direction: "in", account_id: acc1, amount_cents: "500000", category_id: salary });
    purchase = await insert(A, { nature: "expense", direction: "out", account_id: acc1, amount_cents: "12345", category_id: market, description: "Mercado do mês" });
    expect((await balances(A))[acc1]).toEqual(["587655", "0"]);
    expect(await summary(A)).toMatchObject({ income: "500000", expense: "12345", refunds: "0", operational_count: 2 });
  });

  it("transferência própria move saldo entre contas sem virar receita nem despesa", async () => {
    await insert(A, { nature: "transfer", direction: "out", account_id: acc1, to_account_id: acc2, amount_cents: "5001" });
    const b = await balances(A);
    expect([b[acc1][0], b[acc2][0]]).toEqual(["582654", "5001"]);
    expect(BigInt(b[acc1][0]) + BigInt(b[acc2][0])).toBe(587655n); // consolidado igual
    expect(await summary(A)).toMatchObject({ income: "500000", expense: "12345" });
    await fails(insert(A, { nature: "transfer", direction: "out", account_id: acc1, to_account_id: acc1, amount_cents: "1" }));
  });

  it("estorno reduz a despesa, herda a categoria e não passa do valor da compra", async () => {
    await fails(insert(A, { nature: "refund", direction: "in", account_id: acc1, refund_of: purchase, amount_cents: "20000" }));
    const refund = await insert(A, { nature: "refund", direction: "in", account_id: acc1, refund_of: purchase, amount_cents: "2345" });
    const row = (await db.query<{ category_id: string }>("select category_id from public.transactions where id = $1", [refund])).rows[0];
    expect(row.category_id).toBe(market);
    const s = await summary(A);
    expect([s.expense, s.refunds, s.income]).toEqual(["12345", "2345", "500000"]); // despesa líquida 100,00; estorno não é receita
    await fails(insert(A, { nature: "refund", direction: "in", account_id: acc1, refund_of: purchase, amount_cents: "10001" })); // 2345 + 10001 > 12345
    await fails(update(A, purchase, "trashed_at = now()"));
    await fails(update(A, purchase, "amount_cents = 2000"));
    await fails(insert(A, { nature: "refund", direction: "in", account_id: acc1, refund_of: purchase, amount_cents: "1", date: "2026-03-01" })); // antes da compra
    const other = (await db.query<{ id: string }>("select id from public.categories where owner_id = $1 and template_key = 'alimentacao.03'", [A])).rows[0].id;
    await update(A, purchase, `category_id = '${other}'`);
    expect((await db.query<{ category_id: string }>("select category_id from public.transactions where id = $1", [refund])).rows[0].category_id).toBe(other);
  });

  it("ocultar só tira da lista; excluir do relatório tira dos indicadores mas não do saldo; lixeira tira de tudo", async () => {
    const coffee = await insert(A, { nature: "expense", direction: "out", account_id: acc1, amount_cents: "700", description: "Café 100% arábica" });
    const before = (await balances(A))[acc1][0];
    await update(A, coffee, "hidden = true");
    expect((await summary(A)).expense).toBe("13045");
    await update(A, coffee, "excluded_from_reports = true");
    expect((await summary(A)).expense).toBe("12345");
    expect((await balances(A))[acc1][0]).toBe(before);
    await update(A, coffee, "trashed_at = now()");
    expect((await balances(A))[acc1][0]).toBe((BigInt(before) + 700n).toString());
    await update(A, coffee, "trashed_at = null, excluded_from_reports = false");
    expect((await summary(A)).expense).toBe("13045");
    expect((await summary(A, ", null, null, null, null, '100%'")).expense).toBe("700"); // % buscado literalmente
  });

  it("pendente fica fora do saldo e do resultado; liquidado no futuro é recusado", async () => {
    await fails(insert(A, { nature: "expense", direction: "out", account_id: acc1, amount_cents: "100", date: "2199-01-01" }));
    await insert(A, { nature: "expense", direction: "out", account_id: acc2, amount_cents: "9900", date: "2026-03-20", status: "pending" });
    expect((await balances(A))[acc2]).toEqual(["5001", "-9900"]);
    expect(await summary(A)).toMatchObject({ expense: "13045", pending_expense: "9900" });
  });

  it("recusa conta arquivada, data antes do saldo inicial, categoria arquivada ou incompatível e troca de natureza", async () => {
    await fails(insert(A, { nature: "expense", direction: "out", account_id: acc1, amount_cents: "1", date: "2025-12-31" }));
    await fails(insert(A, { nature: "expense", direction: "out", account_id: acc1, amount_cents: "1", category_id: salary }));
    await fails(insert(A, { nature: "income", direction: "out", account_id: acc1, amount_cents: "1" }));
    await as(A, () => db.query("update public.categories set archived_at = now() where id = $1", [salary]));
    await fails(insert(A, { nature: "income", direction: "in", account_id: acc1, amount_cents: "1", category_id: salary }));
    await as(A, () => db.query("update public.categories set archived_at = null where id = $1", [salary]));
    const acc3 = await as(A, async () => (await db.query<{ id: string }>("select public.save_account(null, 'Banco Teste', 'Conta 3', 'cash', 0, '2026-01-01') as id")).rows[0].id);
    await as(A, () => db.query("update public.accounts set archived_at = now() where id = $1", [acc3]));
    await fails(insert(A, { nature: "expense", direction: "out", account_id: acc3, amount_cents: "1" }));
    await fails(update(A, purchase, "nature = 'income'"));
    await fails(as(A, () => db.query("update public.accounts set opening_date = '2026-03-15' where id = $1", [acc1])));
  });

  it("isola usuários: B não lê, não altera, não vincula nem estorna nada de A", async () => {
    const seen = await as(B, () => db.query("select id from public.transactions_read"));
    expect(seen.rows).toEqual([]);
    expect(await summary(B)).toMatchObject({ income: "0", expense: "0", operational_count: 0 });
    expect(Object.keys(await balances(B))).toEqual([accB]);
    expect((await update(B, purchase, "description = 'Invasão'")).rows).toEqual([]);
    await fails(insert(B, { nature: "expense", direction: "out", account_id: acc1, amount_cents: "1" }));
    await fails(insert(B, { nature: "transfer", direction: "out", account_id: accB, to_account_id: acc1, amount_cents: "1" }));
    await fails(insert(B, { nature: "expense", direction: "out", account_id: accB, amount_cents: "1", category_id: market }));
    await fails(insert(B, { nature: "refund", direction: "in", account_id: accB, refund_of: purchase, amount_cents: "1" }));
    await insert(B, { nature: "expense", direction: "out", account_id: accB, amount_cents: "1", category_id: catB });
    await fails(as(A, () => db.query("delete from public.transactions where id = $1", [purchase])));
    await fails(as(null, () => db.query("select * from public.transactions")));
    await fails(as(null, () => db.query("select public.account_balances()")));
  });
});
