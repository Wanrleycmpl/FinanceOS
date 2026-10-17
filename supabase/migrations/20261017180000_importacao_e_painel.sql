-- FinanceOS · Entrega 03 · Importação de CSV e dados do painel (ritmo, calor, categorias).
-- Aplicar DEPOIS de 20261017150000_transacoes.sql. Só ADICIONA estruturas; nada existente é apagado.
--
-- Regras:
-- * cada arquivo importado vira um "lote" (import_batches) com o hash SHA-256 do arquivo:
--   o mesmo arquivo na mesma conta não entra duas vezes;
-- * ID externo do banco (quando o CSV tem) é único por conta, inclusive na lixeira;
-- * o período do arquivo (primeira a última data) marca esses dias como "cobertos" na conta:
--   dia coberto sem gasto = "sem gastos confirmados"; dia não coberto sem lançamento = "sem cobertura".

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  account_id uuid not null,
  file_name text not null check (char_length(btrim(file_name)) between 1 and 200),
  file_hash text not null check (file_hash ~ '^[0-9a-f]{64}$'),
  period_start date not null,
  period_end date not null,
  row_count integer not null check (row_count between 0 and 1000),
  created_at timestamptz not null default now(),
  check (period_end >= period_start),
  unique (owner_id, id),
  unique (owner_id, account_id, file_hash),
  foreign key (owner_id, account_id) references public.accounts(owner_id, id)
);
create index import_batches_coverage_idx on public.import_batches(owner_id, account_id, period_start, period_end);

alter table public.import_batches enable row level security;
create policy import_batches_select on public.import_batches for select to authenticated using (owner_id = (select auth.uid()));
create policy import_batches_insert on public.import_batches for insert to authenticated with check (owner_id = (select auth.uid()));
revoke all on public.import_batches from anon, authenticated;
grant select on public.import_batches to authenticated;
grant insert (owner_id, account_id, file_name, file_hash, period_start, period_end, row_count) on public.import_batches to authenticated;

alter table public.transactions
  add column external_id text check (char_length(external_id) between 1 and 120),
  add column import_batch_id uuid,
  add constraint transactions_import_batch_fk foreign key (owner_id, import_batch_id) references public.import_batches(owner_id, id);
create unique index transactions_external_idx on public.transactions(owner_id, account_id, external_id) where external_id is not null;
-- Origem do lançamento não muda depois (sem UPDATE nessas colunas).
grant insert (external_id, import_batch_id) on public.transactions to authenticated;

-- A view ganha as duas colunas no final (mesmas colunas de antes, na mesma ordem).
create or replace view public.transactions_read with (security_invoker = true) as
select id, nature, direction, account_id, to_account_id, category_id, refund_of, description,
       amount_cents::text as amount_cents, date, status, hidden, excluded_from_reports, trashed_at, created_at,
       external_id, import_batch_id
from public.transactions;

-- Importa um lote inteiro ou nada (função = uma transação). Sinal do valor define receita/despesa.
-- p_period_* = primeira e última data do ARQUIVO (todas as linhas válidas, mesmo as não importadas).
create function public.import_transactions(
  p_account uuid, p_file_name text, p_file_hash text, p_period_start date, p_period_end date, p_rows jsonb
) returns integer language plpgsql security invoker set search_path = '' as $$
declare
  v_owner uuid := auth.uid();
  v_batch uuid;
  v_count integer;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if v_owner is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 1000 then
    raise exception 'invalid_batch_size' using errcode = '22023';
  end if;
  -- Dois envios simultâneos do mesmo arquivo: o segundo espera e cai na regra do hash.
  perform pg_advisory_xact_lock(hashtextextended(v_owner::text || p_account::text, 0));
  if exists (select 1 from public.import_batches where owner_id = v_owner and account_id = p_account and file_hash = p_file_hash) then
    raise exception 'file_already_imported' using errcode = '23505';
  end if;
  if exists (select 1 from jsonb_to_recordset(p_rows) as r(date date) where r.date < p_period_start or r.date > p_period_end) then
    raise exception 'row_outside_period' using errcode = '22023';
  end if;
  v_count := jsonb_array_length(p_rows);
  insert into public.import_batches (owner_id, account_id, file_name, file_hash, period_start, period_end, row_count)
    values (v_owner, p_account, btrim(p_file_name), p_file_hash, p_period_start, p_period_end, v_count)
    returning id into v_batch;
  insert into public.transactions (owner_id, nature, direction, account_id, description, amount_cents, date, status, external_id, import_batch_id)
    select v_owner,
           case r.direction when 'in' then 'income' else 'expense' end,
           r.direction, p_account, btrim(r.description), r.amount_cents, r.date,
           case when r.date > v_today then 'pending' else 'settled' end,
           nullif(btrim(r.external_id), ''), v_batch
    from jsonb_to_recordset(p_rows) as r(description text, amount_cents bigint, direction text, date date, external_id text);
  return v_count;
end $$;
revoke all on function public.import_transactions(uuid, text, text, date, date, jsonb) from public, anon;
grant execute on function public.import_transactions(uuid, text, text, date, date, jsonb) to authenticated;

-- Gasto líquido por dia (despesas − estornos liquidados) + se o dia tem registro e se está coberto
-- por extrato importado em TODAS as contas ativas consideradas. Mesmas exclusões dos indicadores.
create function public.daily_spending(p_from date, p_to date, p_account uuid default null)
returns table (day date, expense_cents text, has_records boolean, covered boolean)
language sql stable security invoker set search_path = '' as $$
  with days as (
    select d::date as day from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') d
  ),
  acc as (
    select a.id from public.accounts a
    where a.owner_id = (select auth.uid()) and a.archived_at is null and (p_account is null or a.id = p_account)
  ),
  tx as (
    select t.date,
           sum(case when t.nature = 'expense' then t.amount_cents else -t.amount_cents end) as net
    from public.transactions t
    where t.owner_id = (select auth.uid()) and t.trashed_at is null and not t.excluded_from_reports
      and t.status = 'settled' and t.nature in ('expense', 'refund')
      and t.date between p_from and p_to
      and (p_account is null or t.account_id = p_account)
    group by t.date
  )
  select d.day,
         coalesce(tx.net, 0)::text,
         tx.date is not null,
         exists (select 1 from acc) and not exists (
           select 1 from acc where not exists (
             select 1 from public.import_batches b
             where b.owner_id = (select auth.uid()) and b.account_id = acc.id and d.day between b.period_start and b.period_end))
  from days d left join tx on tx.date = d.day
  order by d.day
$$;
revoke all on function public.daily_spending(date, date, uuid) from public, anon;
grant execute on function public.daily_spending(date, date, uuid) to authenticated;

-- Totais por categoria (folha), cada lançamento uma única vez. Despesa = despesas − estornos.
-- A soma por categoria principal é feita no app somando as folhas (a principal nunca é somada de novo).
create function public.category_totals(p_from date, p_to date, p_account uuid default null)
returns table (category_id uuid, side text, total_cents text, tx_count integer)
language sql stable security invoker set search_path = '' as $$
  select t.category_id,
         case when t.nature = 'income' then 'income' else 'expense' end as side,
         sum(case when t.nature = 'refund' then -t.amount_cents else t.amount_cents end)::text,
         count(*)::integer
  from public.transactions t
  where t.owner_id = (select auth.uid()) and t.trashed_at is null and not t.excluded_from_reports
    and t.status = 'settled' and t.nature in ('income', 'expense', 'refund')
    and t.date between p_from and p_to
    and (p_account is null or t.account_id = p_account)
  group by t.category_id, 2
$$;
revoke all on function public.category_totals(date, date, uuid) from public, anon;
grant execute on function public.category_totals(date, date, uuid) to authenticated;
