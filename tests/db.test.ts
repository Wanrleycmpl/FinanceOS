// Runs every migration in an in-memory PostgreSQL (PGlite) with a minimal stand-in for
// Supabase's auth schema and roles. Proves the SQL runs and that RLS/grants isolate users.
// It does NOT replace testing on the real Supabase (Auth, e-mail, PostgREST): see npm run test:rls.
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { CATALOG } from "@/lib/catalog";
import { createDb } from "./helpers/pg";

const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";
let db: PGlite;
let as: Awaited<ReturnType<typeof createDb>>["as"];
const fails = (p: Promise<unknown>) => expect(p).rejects.toThrow();

beforeAll(async () => {
  // A user that exists before the migration must also get profile + catalog.
  ({ db, as } = await createDb({ usersBeforeMigrations: [A] }));
  await db.query(`insert into auth.users(id, raw_user_meta_data) values ($1, '{"display_name":"Bia"}')`, [B]);
}, 60_000);

describe("migration de fundação", () => {
  it("copia 15 categorias e 141 subcategorias uma única vez para cada usuário", async () => {
    const subs = CATALOG.reduce((n, c) => n + c.subcategories.length, 0);
    expect([CATALOG.length, subs]).toEqual([15, 141]);
    for (const user of [A, B]) {
      const r = await as(user, () => db.query<{ parents: number; children: number }>(
        "select count(*) filter (where parent_id is null)::int as parents, count(*) filter (where parent_id is not null)::int as children from public.categories"));
      expect(r.rows[0]).toEqual({ parents: 15, children: 141 });
    }
    await db.query("select public.seed_default_categories($1)", [A]); // repetir não duplica
    const again = await db.query<{ n: number }>("select count(*)::int as n from public.categories where owner_id = $1", [A]);
    expect(again.rows[0].n).toBe(156);
    const names = await db.query<{ name: string }>("select name from public.categories where owner_id = $1 and parent_id is null order by sort_order", [A]);
    expect(names.rows.map(r => r.name)).toEqual(CATALOG.map(c => c.name));
    const profile = await as(B, () => db.query<{ display_name: string }>("select display_name from public.profiles"));
    expect(profile.rows).toEqual([{ display_name: "Bia" }]);
  });

  it("cria conta com dinheiro exato em texto e isola usuários", async () => {
    const id = await as(A, async () => (await db.query<{ id: string }>(
      "select public.save_account(null, 'Banco Teste', 'Conta corrente', 'checking', 99999999999999, '2026-01-01') as id")).rows[0].id);
    const own = await as(A, () => db.query<{ opening_balance_cents: string; institution_name: string }>("select opening_balance_cents, institution_name from public.accounts_read where id = $1", [id]));
    expect(own.rows[0]).toEqual({ opening_balance_cents: "99999999999999", institution_name: "Banco Teste" });
    for (const table of ["accounts", "accounts_read", "institutions", "profiles"]) {
      const r = await as(B, () => db.query(`select * from public.${table} where ${table === "profiles" ? "id" : table === "accounts_read" ? "id" : "owner_id"} = $1`, [table === "accounts_read" ? id : A]));
      expect(r.rows, table).toEqual([]);
    }
    const hijack = await as(B, () => db.query("update public.accounts set name = 'Invadida' where id = $1 returning id", [id]));
    expect(hijack.rows).toEqual([]);
    await as(B, () => fails(db.query("select public.save_account($1, 'Banco B', 'Invasão', 'cash', 0, '2026-01-01')", [id])));
  });

  it("recusa dono forjado, instituição alheia, data futura e valor fora do limite", async () => {
    const instA = (await db.query<{ id: string }>("select id from public.institutions where owner_id = $1 limit 1", [A])).rows[0].id;
    await as(B, () => fails(db.query("insert into public.accounts(owner_id, institution_id, name, kind, opening_date) values ($1, $2, 'Forjada', 'cash', '2026-01-01')", [A, instA])));
    await as(B, () => fails(db.query("insert into public.accounts(institution_id, name, kind, opening_date) values ($1, 'Relação cruzada', 'cash', '2026-01-01')", [instA])));
    await as(A, () => fails(db.query("select public.save_account(null, 'Banco', 'Futura', 'cash', 0, current_date + 400)")));
    await as(A, () => fails(db.query("select public.save_account(null, 'Banco', 'Grande', 'cash', 100000000000000, '2026-01-01')")));
    await as(A, () => fails(db.query("delete from public.accounts")));
  });

  it("categorias: próprias, subcategoria herda tipo, sem template forjado nem vínculo alheio", async () => {
    const parentA = (await db.query<{ id: string }>("select id from public.categories where owner_id = $1 and template_key = 'renda'", [A])).rows[0].id;
    const sub = await as(A, () => db.query<{ kind: string }>("insert into public.categories(parent_id, name, kind) values ($1, 'Bico de fim de semana', 'expense') returning kind", [parentA]));
    expect(sub.rows[0].kind).toBe("income");
    await as(A, () => fails(db.query("insert into public.categories(name, kind, template_key) values ('Falsa', 'expense', 'renda')")));
    await as(B, () => fails(db.query("insert into public.categories(parent_id, name, kind) values ($1, 'Sub alheia', 'expense')", [parentA])));
    await as(A, () => fails(db.query("insert into public.categories(parent_id, name, kind) values ((select id from public.categories where template_key = 'renda.01' and owner_id = $1), 'Neta', 'income')", [A])));
    const archived = await as(A, () => db.query("update public.categories set archived_at = now() where id = $1 returning id", [parentA]));
    expect(archived.rows).toHaveLength(1);
    await as(A, () => fails(db.query("insert into public.categories(parent_id, name, kind) values ($1, 'Em pai arquivado', 'income')", [parentA])));
    await as(A, () => fails(db.query("update public.categories set parent_id = null where id = $1", [parentA])));
  });

  it("anônimo não lê nada nem executa funções", async () => {
    await as(null, () => fails(db.query("select * from public.accounts")));
    await as(null, () => fails(db.query("select * from public.categories")));
    await as(null, () => fails(db.query("select public.save_account(null, 'X', 'Anon', 'cash', 0, '2026-01-01')")));
  });
});
