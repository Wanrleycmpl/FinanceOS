// Personal subscriptions (migration 20261017235000_assinaturas), run in PGlite.
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createDb } from "./helpers/pg";

const A = "00000000-0000-0000-0000-0000000000a5";
const B = "00000000-0000-0000-0000-0000000000b5";
let db: PGlite;
let as: Awaited<ReturnType<typeof createDb>>["as"];
let acc: string, card: string, streaming: string;
const fails = (p: Promise<unknown>) => expect(p).rejects.toThrow();

const addSub = (user: string, v: Record<string, string | number | null>) => as(user, async () => {
  const cols = Object.keys(v);
  return (await db.query<{ id: string }>(`insert into public.personal_subscriptions (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")}) returning id`, Object.values(v))).rows[0].id;
});
const charge = (user: string, sub: string, date: string, cents: string) =>
  as(user, async () => (await db.query<{ id: string }>("select public.register_subscription_charge($1, $2, $3) as id", [sub, date, cents])).rows[0].id);
const nextOf = async (sub: string) => (await db.query<{ d: string }>("select next_charge_date::text as d from public.personal_subscriptions where id = $1", [sub])).rows[0].d;
const summary = async () => (await as(A, () => db.query<{ s: Record<string, string> }>("select public.transaction_summary('2026-01-01', '2026-12-31') as s"))).rows[0].s;

beforeAll(async () => {
  ({ db, as } = await createDb());
  await db.query("insert into auth.users(id) values ($1), ($2)", [A, B]);
  const one = async (sql: string) => as(A, async () => (await db.query<{ id: string }>(sql)).rows[0].id);
  acc = await one("select public.save_account(null, 'Banco Teste', 'Corrente', 'checking', 100000, '2026-01-01') as id");
  card = await one("select public.save_card(null, 'Banco Teste', 'Cartão', null, 500000, 10, 20) as id");
  streaming = (await db.query<{ id: string }>("select id from public.categories where owner_id = $1 and template_key = 'digitais.05'", [A])).rows[0].id;
}, 60_000);

describe("assinaturas pessoais", () => {
  it("próxima data mantém o dia da cobrança em meses curtos e por período", async () => {
    const next = async (d: string, p: string, a: number) => (await db.query<{ d: string }>("select public.subscription_next($1, $2, $3)::text as d", [d, p, a])).rows[0].d;
    expect(await next("2026-01-31", "monthly", 31)).toBe("2026-02-28");
    expect(await next("2026-02-28", "monthly", 31)).toBe("2026-03-31");
    expect(await next("2026-01-15", "quarterly", 15)).toBe("2026-04-15");
    expect(await next("2026-08-31", "semiannual", 31)).toBe("2027-02-28");
    expect(await next("2026-03-10", "annual", 10)).toBe("2027-03-10");
    expect(await next("2026-03-10", "weekly", 10)).toBe("2026-03-17");
  });

  it("cadastro não é despesa; registrar a cobrança cria um único lançamento e avança a data", async () => {
    const sub = await addSub(A, { name: "Streaming", amount_cents: "3990", period: "monthly", anchor_day: 31, next_charge_date: "2026-01-31", account_id: acc, category_id: streaming });
    expect((await summary()).expense).toBe("0"); // previsão não vira despesa
    const tx = await charge(A, sub, "2026-01-31", "3990");
    const row = (await db.query<{ subscription_id: string; category_id: string; amount_cents: string; account_id: string }>("select subscription_id, category_id, amount_cents::text, account_id from public.transactions where id = $1", [tx])).rows[0];
    expect(row).toEqual({ subscription_id: sub, category_id: streaming, amount_cents: "3990", account_id: acc });
    expect(await nextOf(sub)).toBe("2026-02-28");
    expect((await summary()).expense).toBe("3990");
    await charge(A, sub, "2026-03-05", "4290"); // pagou atrasado, com reajuste
    expect(await nextOf(sub)).toBe("2026-03-31");
    expect((await summary()).expense).toBe("8280");
  });

  it("anual no cartão vai para a fatura; pausada/cancelada não registra cobrança", async () => {
    const sub = await addSub(A, { name: "Nuvem anual", amount_cents: "12000", period: "annual", anchor_day: 12, next_charge_date: "2026-02-12", card_id: card, category_id: streaming });
    const tx = await charge(A, sub, "2026-02-12", "12000");
    expect((await db.query<{ statement_month: string }>("select statement_month::text from public.transactions where id = $1", [tx])).rows[0].statement_month).toBe("2026-03-01");
    expect(await nextOf(sub)).toBe("2027-02-12");
    await as(A, () => db.query("update public.personal_subscriptions set status = 'paused' where id = $1", [sub]));
    await fails(charge(A, sub, "2026-02-13", "12000"));
    await fails(charge(A, sub, "2199-01-01", "1")); // pausada e também futura
  });

  it("valida meio único, cobrança no futuro e isolamento", async () => {
    await fails(addSub(A, { name: "Dupla", amount_cents: "1", period: "monthly", anchor_day: 1, next_charge_date: "2026-01-01", account_id: acc, card_id: card }));
    await fails(addSub(A, { name: "Nenhum", amount_cents: "1", period: "monthly", anchor_day: 1, next_charge_date: "2026-01-01" }));
    const sub = await addSub(A, { name: "Academia", amount_cents: "9990", period: "monthly", anchor_day: 5, next_charge_date: "2026-01-05", account_id: acc });
    await fails(charge(A, sub, "2199-01-05", "9990"));
    await fails(charge(B, sub, "2026-01-05", "9990"));
    await fails(addSub(B, { name: "Invasão", amount_cents: "1", period: "monthly", anchor_day: 1, next_charge_date: "2026-01-01", account_id: acc }));
    expect((await as(B, () => db.query("select id from public.personal_subscriptions"))).rows).toEqual([]);
    expect((await as(B, () => db.query("update public.personal_subscriptions set amount_cents = 1 where id = $1 returning id", [sub]))).rows).toEqual([]);
    await fails(as(A, () => db.query("delete from public.personal_subscriptions where id = $1", [sub])));
    await fails(as(null, () => db.query("select * from public.personal_subscriptions")));
  });
});
