// Read-only, anonymous probe of the Supabase project in .env.local. Never signs in, never
// writes, never prints the URL or key. Tells which FinanceOS objects exist:
// "permission denied" = exists and anonymous is blocked (expected); "not found" = missing.
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) { console.error('Não executado: preencha NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY em .env.local.'); process.exit(1); }
if (/^sb_secret_/.test(key) || /service_role/.test(key)) { console.error('PARE: a chave em NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY parece secreta. Use a chave publicável (sb_publishable_...).'); process.exit(1); }

const anon = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const state = (error, data) => {
  if (!error) return data?.length ? 'EXISTE e anônimo LEU dados (revisar RLS!)' : 'existe';
  if (['PGRST205', 'PGRST202', '42P01', '42883'].includes(error.code)) return 'AUSENTE';
  if (error.code === '42501' || /permission denied/i.test(error.message)) return 'existe';
  return `indeterminado (${error.code ?? 'sem código'})`;
};

const MIGRATIONS = [
  ["20261017120000_fundacao", ["profiles", "institutions", "accounts", "accounts_read", "category_templates", "categories"], ["save_account", { p_id: null, p_institution: "x", p_name: "x", p_kind: "cash", p_opening_balance_cents: "0", p_opening_date: "2026-01-01" }]],
  ["20261017150000_transacoes", ["transactions", "transactions_read"], ["account_balances", {}]],
];
const results = [];
for (const [migration, tables, [fn, args]] of MIGRATIONS) {
  const found = [];
  for (const table of tables) {
    const { data, error } = await anon.from(table).select("*").limit(1);
    found.push(state(error, data)); console.log(`${table}: ${found.at(-1)}`);
  }
  const rpc = await anon.rpc(fn, args);
  found.push(rpc.error ? state(rpc.error) : "EXECUTOU para anônimo (revisar!)"); console.log(`função ${fn}: ${found.at(-1)}`);
  results.push([migration, found]);
}

try {
  const s = await (await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } })).json();
  console.log(`Auth: e-mail ${s.external?.email ? 'habilitado' : 'desabilitado'}; confirmação de e-mail ${s.mailer_autoconfirm ? 'DESLIGADA' : 'exigida'}.`);
} catch { console.log('Auth: configurações públicas indisponíveis.'); }

console.log("");
for (const [migration, found] of results) {
  const summary = found.every(s => s === "existe") ? "APLICADA" : found.every(s => s === "AUSENTE") ? "NÃO aplicada" : "PARCIAL/indeterminada — não aplique nada sem revisar";
  console.log(`Migration ${migration}: ${summary}.`);
}
console.log("(Não lê o histórico nem testa usuários; veja npm run test:rls.)");
if (results.some(([, found]) => found.some(s => s.includes("revisar")))) process.exitCode = 1;
