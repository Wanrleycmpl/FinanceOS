// Installment plans (migration 20261017230000_parcelamentos), run in PGlite.
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { todayInBrazil } from "@/lib/dates";
import { createDb } from "./helpers/pg";

const A = "00000000-0000-0000-0000-0000000000a4";
const B = "00000000-0000-0000-0000-0000000000b4";
let db: PGlite;
let as: Awaited<ReturnType<typeof createDb>>["as"];
let acc: string, card: string, market: string;
const fails = (p: Promise<unknown>) => expect(p).rejects.toThrow();
const today = todayInBrazil();

const create = (user: string, args: { desc?: string; total: string; n: number; first: string; account?: string | null; card?: string | null; paid?: number }) =>
  as(user, async () => (await db.query<{ id: string }>(
    "select public.create_installment_plan($1, $2, $3, $4, $5, $6, $7, $8) as id",
    [args.desc ?? "Geladeira", args.total, args.n, args.first, args.account ?? null, args.card ?? null, market, args.paid ?? 0])).rows[0].id);
const rows = (plan: string) => db.query<{ id: string; installment_number: number; amount_cents: string; date: string; status: string; statement_month: string | null; trashed: boolean; description: string }>(
  "select id, installment_number, amount_cents::text, date::text, status, statement_month::text, trashed_at is not null as trashed, description from public.transactions where plan_id = $1 and nature = 'expense' order by installment_number", [plan]).then(r => r.rows);
const committed = async () => (await as(A, () => db.query<{ committed_cents: string }>("select committed_cents from public.card_overview()"))).rows[0].committed_cents;
const balance = async () => (await as(A, () => db.query<{ account_id: string; balance_cents: string }>("select * from public.account_balances()"))).rows.find(r => r.account_id === acc)?.balance_cents;

beforeAll(async () => {
  ({ db, as } = await createDb());
  await db.query("insert into auth.users(id) values ($1), ($2)", [A, B]);
  const one = async (user: string, sql: string) => as(user, async () => (await db.query<{ id: string }>(sql)).rows[0].id);
  acc = await one(A, "select public.save_account(null, 'Banco Teste', 'Corrente', 'checking', 100000, '2026-01-01') as id");
  card = await one(A, "select public.save_card(null, 'Banco Teste', 'Cartão', null, 500000, 10, 20) as id");
  market = (await db.query<{ id: string }>("select id from public.categories where owner_id = $1 and template_key = 'compras.14'", [A])).rows[0].id;
}, 60_000);

describe("parcelamentos", () => {
  it("R$ 100,00 em 3 vira 33,34 + 33,33 + 33,33, um mês por parcela, sem compra-mãe", async () => {
    const plan = await create(A, { total: "10000", n: 3, first: "2026-01-31", account: acc });
    const r = await rows(plan);
    expect(r.map(x => [x.installment_number, x.amount_cents, x.date, x.status])).toEqual([
      [1, "3334", "2026-01-31", "pending"], [2, "3333", "2026-02-28", "pending"], [3, "3333", "2026-03-31", "pending"],
    ]);
    expect(r.reduce((s, x) => s + BigInt(x.amount_cents), 0n)).toBe(10000n);
    expect(r[0].description).toBe("Geladeira (1/3)");
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.transactions where owner_id = $1", [A])).rows[0].n).toBe(3); // só as parcelas
    expect(await balance()).toBe("100000"); // pendente não mexe no saldo
  });

  it("pagamento exige confirmação; data passada não basta; valor da parcela não muda", async () => {
    const plan = await create(A, { total: "30000", n: 3, first: "2026-02-10", account: acc, paid: 1 });
    const r = await rows(plan);
    expect(r.map(x => x.status)).toEqual(["settled", "pending", "pending"]);
    expect(await balance()).toBe("90000");
    await as(A, () => db.query("update public.transactions set status = 'settled' where id = $1", [r[1].id])); // confirmar a 2ª
    expect(await balance()).toBe("80000");
    await fails(as(A, () => db.query("update public.transactions set amount_cents = 1 where id = $1", [r[2].id])));
    await fails(as(A, () => db.query("update public.transactions set trashed_at = now() where id = $1", [r[2].id])));
    await fails(as(A, () => db.query("update public.transactions set card_id = $2, account_id = null where id = $1", [r[2].id, card])));
    await fails(create(A, { total: "30000", n: 3, first: "2199-01-01", account: acc, paid: 1 })); // pagar parcela futura
  });

  it("no cartão: cada parcela vai para a sua fatura e todas comprometem o limite", async () => {
    const plan = await create(A, { total: "120000", n: 12, first: "2026-03-05", card });
    const r = await rows(plan);
    expect(r.every(x => x.status === "settled")).toBe(true);
    expect([r[0].statement_month, r[1].statement_month, r[11].statement_month]).toEqual(["2026-03-01", "2026-04-01", "2027-02-01"]);
    expect(await committed()).toBe("120000");
    await fails(as(A, () => db.query("update public.transactions set status = 'pending' where id = $1", [r[11].id])));
    await fails(create(A, { total: "1000", n: 2, first: "2026-03-05", card, paid: 1 }));
    await fails(create(A, { total: "1000", n: 2, first: "2026-03-05", card, account: acc }));
    await fails(create(A, { total: "1", n: 2, first: "2026-03-05", card })); // menos de 1 centavo por parcela
  });

  it("cancelar com estorno: futuras vão para a lixeira, cobradas são estornadas uma única vez", async () => {
    const plan = await create(A, { total: "100000", n: 10, first: "2026-01-05", card });
    const charged = (await rows(plan)).filter(x => x.date <= today).length;
    const before = BigInt(await committed());
    await as(A, () => db.query("select public.cancel_installment_plan($1, true)", [plan]));
    const r = await rows(plan);
    expect(r.filter(x => x.trashed).length).toBe(10 - charged);
    const refunds = (await db.query<{ total: string; n: number }>("select coalesce(sum(amount_cents), 0)::text as total, count(*)::int as n from public.transactions where nature = 'refund' and refund_of in (select id from public.transactions where plan_id = $1)", [plan])).rows[0];
    expect(refunds.n).toBe(charged);
    expect(BigInt(refunds.total)).toBe(BigInt(charged) * 10000n);
    expect(BigInt(await committed())).toBe(before - 100000n); // plano inteiro deixa de comprometer o limite
    await fails(as(A, () => db.query("select public.cancel_installment_plan($1, true)", [plan])));
    const cancelled = (await db.query<{ c: boolean }>("select cancelled_at is not null as c from public.installment_plans where id = $1", [plan])).rows[0];
    expect(cancelled.c).toBe(true);
  });

  it("cancelar sem estorno numa conta: pagas ficam, pendentes saem", async () => {
    const plan = await create(A, { total: "9000", n: 3, first: "2026-04-01", account: acc, paid: 1 });
    const bal = await balance();
    await as(A, () => db.query("select public.cancel_installment_plan($1, false)", [plan]));
    const r = await rows(plan);
    expect(r.map(x => [x.status, x.trashed])).toEqual([["settled", false], ["pending", true], ["pending", true]]);
    expect(await balance()).toBe(bal);
    await fails(as(A, () => db.query("update public.transactions set trashed_at = null where id = $1", [r[1].id]))); // não "descancela"
  });

  it("isola usuários e não deixa gravar plano pela API direta", async () => {
    await fails(create(B, { total: "1000", n: 2, first: "2026-03-05", account: acc }));
    const plan = await create(A, { total: "2000", n: 2, first: "2026-05-01", account: acc });
    await fails(as(B, () => db.query("select public.cancel_installment_plan($1, false)", [plan])));
    expect((await as(B, () => db.query("select * from public.installment_plans"))).rows).toEqual([]);
    await fails(as(A, () => db.query("insert into public.installment_plans (description, total_cents, installments_count, first_date, account_id) values ('x', 100, 2, '2026-01-01', $1)", [acc])));
    await fails(as(A, () => db.query("insert into public.transactions (nature, direction, account_id, description, amount_cents, date, status, plan_id, installment_number) values ('expense', 'out', $1, 'x', 1, '2026-01-01', 'pending', $2, 3)", [acc, plan])));
    await fails(as(null, () => db.query("select public.create_installment_plan('x', 100, 2, '2026-01-01', null, null, null, 0)")));
  });
});
