// In-memory PostgreSQL (PGlite) with a minimal stand-in for Supabase's auth schema and roles,
// so tests can run every migration and act as a given user under RLS.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const SUPABASE_STUB = `
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  grant select on auth.users to authenticated;
`;

export async function createDb(options: { usersBeforeMigrations?: string[] } = {}) {
  const db = new PGlite();
  await db.exec(SUPABASE_STUB);
  for (const id of options.usersBeforeMigrations ?? []) await db.query("insert into auth.users(id) values ($1)", [id]);
  const dir = join(process.cwd(), "supabase", "migrations");
  for (const file of readdirSync(dir).filter(f => f.endsWith(".sql")).sort()) await db.exec(readFileSync(join(dir, file), "utf8"));

  async function as<T>(user: string | null, fn: () => Promise<T>): Promise<T> {
    await db.exec(`set role ${user ? "authenticated" : "anon"}`);
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user ?? ""]);
    try { return await fn(); } finally { await db.exec("reset role"); }
  }
  return { db, as };
}
