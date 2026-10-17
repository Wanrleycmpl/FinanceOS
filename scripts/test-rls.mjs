// Real isolation test on the Supabase TEST project: two confirmed fictitious users (A, B)
// and an anonymous client, all with the publishable key only. Logs step names, never secrets.
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const required = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'RLS_TEST_USER_A_EMAIL', 'RLS_TEST_USER_A_PASSWORD', 'RLS_TEST_USER_B_EMAIL', 'RLS_TEST_USER_B_PASSWORD'];
if (required.some(k => !process.env[k])) { console.error('Não executado: preencha .env.local com o Supabase de TESTE e os usuários A/B confirmados (veja docs/SUPABASE.md).'); process.exit(1); }
const client = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const a = client(), b = client(), anon = client();
const tag = `RLS-${Date.now()}`;
const created = []; // [client, table, id] archived at the end
let current = 'início', failed = false;
const step = async (name, fn) => { current = name; await fn(); console.log(`ok  ${name}`); };

try {
  let userA, userB, accA, catA;
  await step('login de A e B', async () => {
    const la = await a.auth.signInWithPassword({ email: process.env.RLS_TEST_USER_A_EMAIL, password: process.env.RLS_TEST_USER_A_PASSWORD });
    const lb = await b.auth.signInWithPassword({ email: process.env.RLS_TEST_USER_B_EMAIL, password: process.env.RLS_TEST_USER_B_PASSWORD });
    assert.equal(la.error, null, 'login de A falhou (e-mail confirmado?)'); assert.equal(lb.error, null, 'login de B falhou (e-mail confirmado?)');
    userA = la.data.user; userB = lb.data.user; assert.notEqual(userA.id, userB.id, 'use dois usuários diferentes');
  });

  await step('cada usuário tem 15 categorias e 141 subcategorias, uma vez só', async () => {
    for (const c of [a, b]) {
      const r = await c.from('categories').select('parent_id, template_key').not('template_key', 'is', null);
      assert.equal(r.error, null);
      assert.equal(r.data.filter(x => !x.parent_id).length, 15); assert.equal(r.data.filter(x => x.parent_id).length, 141);
    }
  });

  await step('A cria conta; valor volta exato como texto', async () => {
    const r = await a.rpc('save_account', { p_id: null, p_institution: `${tag} Banco`, p_name: `${tag} Conta`, p_kind: 'checking', p_opening_balance_cents: '99999999999999', p_opening_date: '2026-01-01' });
    assert.equal(r.error, null, 'save_account falhou (migration aplicada?)'); accA = r.data; created.push([a, 'accounts', accA]);
    const v = await a.from('accounts_read').select('opening_balance_cents').eq('id', accA).single();
    assert.equal(v.error, null); assert.equal(v.data.opening_balance_cents, '99999999999999');
  });

  await step('B não lê nada de A (contas, view, instituições, perfil, categorias)', async () => {
    for (const [table, col, val] of [['accounts', 'id', accA], ['accounts_read', 'id', accA], ['institutions', 'owner_id', userA.id], ['profiles', 'id', userA.id], ['categories', 'owner_id', userA.id]]) {
      const r = await b.from(table).select('*').eq(col, val); assert.equal(r.error, null); assert.deepEqual(r.data, [], `B leu ${table} de A`);
    }
  });

  await step('B não altera conta, perfil nem categoria de A', async () => {
    catA = (await a.from('categories').select('id').eq('template_key', 'renda').single()).data.id;
    for (const [table, id, patch] of [['accounts', accA, { name: 'Invasão' }], ['profiles', userA.id, { display_name: 'Invasão' }], ['categories', catA, { name: 'Invasão' }]]) {
      const r = await b.from(table).update(patch).eq('id', id).select('id'); assert.ok(r.error || r.data.length === 0, `B alterou ${table} de A`);
    }
    const rpc = await b.rpc('save_account', { p_id: accA, p_institution: 'X', p_name: 'Invasão', p_kind: 'cash', p_opening_balance_cents: '0', p_opening_date: '2026-01-01' });
    assert.ok(rpc.error, 'B editou conta de A pela função');
  });

  await step('dono forjado, instituição alheia, subcategoria em categoria alheia e template forjado são recusados', async () => {
    const inst = (await a.from('accounts').select('institution_id').eq('id', accA).single()).data.institution_id;
    assert.ok((await b.from('accounts').insert({ owner_id: userA.id, institution_id: inst, name: 'Forjada', kind: 'cash', opening_date: '2026-01-01' })).error);
    assert.ok((await b.from('accounts').insert({ institution_id: inst, name: 'Cruzada', kind: 'cash', opening_date: '2026-01-01' })).error);
    assert.ok((await b.from('categories').insert({ parent_id: catA, name: `${tag} sub`, kind: 'income' })).error);
    assert.ok((await a.from('categories').insert({ name: `${tag} falsa`, kind: 'expense', template_key: 'renda' })).error);
    await a.from('accounts').delete().eq('id', accA); // sem permissão de DELETE: nada pode sumir
    assert.equal((await a.from('accounts').select('id').eq('id', accA)).data.length, 1, 'conta foi apagada');
  });

  await step('data futura e valor acima do limite são recusados', async () => {
    const future = new Date(Date.now() + 400 * 864e5).toISOString().slice(0, 10);
    assert.ok((await a.rpc('save_account', { p_id: null, p_institution: `${tag} Banco`, p_name: 'Futura', p_kind: 'cash', p_opening_balance_cents: '0', p_opening_date: future })).error);
    assert.ok((await a.rpc('save_account', { p_id: null, p_institution: `${tag} Banco`, p_name: 'Grande', p_kind: 'cash', p_opening_balance_cents: '100000000000000', p_opening_date: '2026-01-01' })).error);
  });

  await step('A cria subcategoria própria que herda o tipo', async () => {
    const r = await a.from('categories').insert({ parent_id: catA, name: `${tag} bico`, kind: 'expense' }).select('id, kind').single();
    assert.equal(r.error, null); assert.equal(r.data.kind, 'income'); created.push([a, 'categories', r.data.id]);
  });

  await step('anônimo não lê nem grava', async () => {
    for (const t of ['accounts', 'categories', 'profiles']) { const r = await anon.from(t).select('id'); assert.ok(r.error || r.data.length === 0); }
    assert.ok((await anon.rpc('save_account', { p_id: null, p_institution: 'X', p_name: 'Anon', p_kind: 'cash', p_opening_balance_cents: '0', p_opening_date: '2026-01-01' })).error);
  });
} catch (error) {
  failed = true;
  console.error(`FAIL em "${current}": ${String(error?.message ?? 'erro').split('\n')[0]}`);
} finally {
  // No deletes exist by design: test data is archived and keeps the RLS- prefix.
  let clean = true;
  for (const [c, table, id] of created) {
    const r = await c.from(table).update({ archived_at: new Date().toISOString() }).eq('id', id).select('id');
    if (r.error || r.data?.length !== 1) clean = false;
  }
  await a.auth.signOut(); await b.auth.signOut();
  if (!failed) console.log('PASS: isolamento entre A, B e anônimo confirmado no Supabase.');
  console.log(clean ? `Dados de teste (${tag}) arquivados.` : `Arquivamento incompleto: revise itens ${tag} no projeto de teste.`);
  if (failed || !clean) process.exitCode = 1;
}
