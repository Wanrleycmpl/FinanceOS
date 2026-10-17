-- FinanceOS · Entrega 04 · Cartões de crédito e faturas.
-- Aplicar DEPOIS de 20261017180000_importacao_e_painel.sql. Só adiciona/estende; nada é apagado.
--
-- Regras:
-- * compra no cartão é uma despesa com card_id (sem conta): entra nos gastos na data da compra,
--   mas NÃO mexe no saldo de nenhuma conta; ela aumenta a dívida do cartão;
-- * cada lançamento do cartão pertence a uma fatura (statement_month = 1º dia do mês em que a fatura fecha);
--   compra feita a partir do dia de fechamento vai para a fatura seguinte;
-- * pagamento de fatura (nature = card_payment) sai de uma conta e reduz a dívida do cartão:
--   não é despesa (a compra já foi contada) e não entra no resultado;
-- * limite comprometido = compras − estornos − pagamentos liquidados, incluindo lançamentos futuros
--   (parcelas); disponível = limite − comprometido. Limite não é dinheiro em conta.

create table public.credit_cards (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  institution_id uuid not null,
  name text not null check (char_length(btrim(name)) between 2 and 60),
  last4 text check (last4 ~ '^[0-9]{4}$'),
  limit_cents bigint not null check (limit_cents between 0 and 99999999999999),
  closing_day smallint not null check (closing_day between 1 and 31),
  due_day smallint not null check (due_day between 1 and 31),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, id),
  foreign key (owner_id, institution_id) references public.institutions(owner_id, id)
);
alter table public.credit_cards enable row level security;
create policy credit_cards_select on public.credit_cards for select to authenticated using (owner_id = (select auth.uid()));
create policy credit_cards_insert on public.credit_cards for insert to authenticated with check (owner_id = (select auth.uid()));
create policy credit_cards_update on public.credit_cards for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
revoke all on public.credit_cards from anon, authenticated;
grant select on public.credit_cards to authenticated;
grant insert (owner_id, institution_id, name, last4, limit_cents, closing_day, due_day) on public.credit_cards to authenticated;
grant update (institution_id, name, last4, limit_cents, closing_day, due_day, archived_at) on public.credit_cards to authenticated;
create trigger credit_cards_touch before update on public.credit_cards for each row execute function public.touch_updated_at();

-- Fatura de uma data: fecha no dia de fechamento do mês (ou no último dia, em meses curtos).
create function public.statement_for(p_date date, p_closing_day integer) returns date
language sql immutable set search_path = '' as $$
  select case
    when p_date < make_date(extract(year from p_date)::int, extract(month from p_date)::int,
                            least(p_closing_day, extract(day from (date_trunc('month', p_date) + interval '1 month - 1 day'))::int))
    then date_trunc('month', p_date)::date
    else (date_trunc('month', p_date) + interval '1 month')::date
  end
$$;

-- Cria/edita cartão e instituição juntos. security invoker: a RLS vale aqui dentro.
create function public.save_card(
  p_id uuid, p_institution text, p_name text, p_last4 text, p_limit_cents bigint, p_closing_day integer, p_due_day integer
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_owner uuid := auth.uid(); v_institution uuid; v_id uuid;
begin
  if v_owner is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  insert into public.institutions (owner_id, name) values (v_owner, btrim(p_institution))
    on conflict (owner_id, name_key) do update set name = excluded.name
    returning id into v_institution;
  if p_id is null then
    insert into public.credit_cards (owner_id, institution_id, name, last4, limit_cents, closing_day, due_day)
      values (v_owner, v_institution, btrim(p_name), nullif(btrim(p_last4), ''), p_limit_cents, p_closing_day, p_due_day)
      returning id into v_id;
  else
    update public.credit_cards
      set institution_id = v_institution, name = btrim(p_name), last4 = nullif(btrim(p_last4), ''),
          limit_cents = p_limit_cents, closing_day = p_closing_day, due_day = p_due_day
      where id = p_id and owner_id = v_owner
      returning id into v_id;
    if v_id is null then raise exception 'card_not_found' using errcode = 'P0002'; end if;
  end if;
  return v_id;
end $$;
revoke all on function public.save_card(uuid, text, text, text, bigint, integer, integer) from public, anon;
grant execute on function public.save_card(uuid, text, text, text, bigint, integer, integer) to authenticated;

-- Transações: meio de pagamento pode ser conta OU cartão; novo tipo "pagamento de fatura".
alter table public.transactions
  alter column account_id drop not null,
  add column card_id uuid,
  add column statement_month date check (statement_month is null or extract(day from statement_month) = 1),
  add constraint transactions_card_fk foreign key (owner_id, card_id) references public.credit_cards(owner_id, id);
create index transactions_card_idx on public.transactions(owner_id, card_id, statement_month) where card_id is not null;
grant insert (card_id, statement_month), update (card_id, statement_month) on public.transactions to authenticated;

-- Troca as regras de tipo/sentido (as antigas não conheciam card_payment). Os nomes são procurados
-- pela definição para não depender de nomes gerados automaticamente.
do $$
declare c record;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.transactions'::regclass and contype = 'c'
             and (conname = 'transactions_nature_check'
                  or (pg_get_constraintdef(oid) like '%direction%' and pg_get_constraintdef(oid) like '%financial%'))
  loop
    execute format('alter table public.transactions drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.transactions
  add constraint transactions_nature_check
    check (nature in ('income', 'expense', 'transfer', 'refund', 'financial', 'card_payment')),
  add constraint transactions_nature_direction_check
    check (nature = 'financial'
           or (nature in ('income', 'refund') and direction = 'in')
           or (nature in ('expense', 'transfer', 'card_payment') and direction = 'out')),
  add constraint transactions_means_check
    check (case
             when nature = 'card_payment' then account_id is not null and card_id is not null and statement_month is not null
             when nature in ('expense', 'refund') then (account_id is null) <> (card_id is null) and (card_id is null) = (statement_month is null)
             else account_id is not null and card_id is null and statement_month is null
           end);

-- Validações (substitui a versão da Entrega 02, mantendo todas as regras anteriores).
create or replace function public.guard_transaction() returns trigger language plpgsql set search_path = '' as $$
declare
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_acc public.accounts;
  v_card public.credit_cards;
  v_cat public.categories;
  v_parent_archived boolean;
  v_origin public.transactions;
  v_refunded bigint;
begin
  if new.status = 'settled' and new.date > v_today then
    raise exception 'settled_in_future' using errcode = '22023', hint = 'Lançamento futuro deve ficar pendente.';
  end if;

  -- Contas: ativas (ao escolher) e com data a partir do saldo inicial.
  for v_acc in select * from public.accounts where owner_id = new.owner_id and id in (new.account_id, new.to_account_id) loop
    if v_acc.archived_at is not null and (tg_op = 'INSERT' or not (v_acc.id is not distinct from old.account_id or v_acc.id is not distinct from old.to_account_id)) then
      raise exception 'account_archived' using errcode = '22023';
    end if;
    if new.date < v_acc.opening_date then
      raise exception 'before_opening_date' using errcode = '22023';
    end if;
  end loop;

  -- Cartão: ativo ao escolher; fatura calculada pela data quando não informada.
  if new.card_id is not null then
    select * into v_card from public.credit_cards where owner_id = new.owner_id and id = new.card_id;
    if not found then raise exception 'card_not_found' using errcode = '23503'; end if;
    -- Pagar fatura de cartão arquivado continua permitido (a dívida existe).
    if v_card.archived_at is not null and new.nature <> 'card_payment' and (tg_op = 'INSERT' or old.card_id is distinct from new.card_id) then
      raise exception 'card_archived' using errcode = '22023';
    end if;
    if new.nature in ('expense', 'refund') and new.statement_month is null then
      new.statement_month := public.statement_for(new.date, v_card.closing_day);
    end if;
    if new.nature = 'card_payment' and new.category_id is not null then
      raise exception 'payment_without_category' using errcode = '22023';
    end if;
  end if;

  -- Estorno: herda categoria e meio da compra (mesmo cartão) e respeita o valor dela.
  if new.nature = 'refund' then
    select * into v_origin from public.transactions where owner_id = new.owner_id and id = new.refund_of for update;
    if not found or v_origin.nature <> 'expense' or v_origin.trashed_at is not null then
      raise exception 'invalid_refund_origin' using errcode = '22023';
    end if;
    if new.date < v_origin.date then raise exception 'refund_before_purchase' using errcode = '22023'; end if;
    if v_origin.card_id is distinct from new.card_id then raise exception 'refund_means_mismatch' using errcode = '22023'; end if;
    new.category_id := v_origin.category_id;
    if new.trashed_at is null then
      select coalesce(sum(amount_cents), 0) into v_refunded from public.transactions
        where owner_id = new.owner_id and refund_of = new.refund_of and trashed_at is null and id <> new.id;
      if v_refunded + new.amount_cents > v_origin.amount_cents then
        raise exception 'refund_exceeds_purchase' using errcode = '22023';
      end if;
    end if;
  end if;

  -- Compra com estornos ativos: não pode ir para a lixeira nem ficar menor que os estornos.
  if tg_op = 'UPDATE' and new.nature = 'expense' then
    select coalesce(sum(amount_cents), 0) into v_refunded from public.transactions
      where owner_id = new.owner_id and refund_of = new.id and trashed_at is null;
    if v_refunded > 0 and (new.trashed_at is not null or new.amount_cents < v_refunded or new.card_id is distinct from old.card_id) then
      raise exception 'purchase_has_refunds' using errcode = '22023';
    end if;
  end if;

  -- Categoria: ativa ao escolher e compatível com o tipo do lançamento.
  if new.category_id is not null and new.nature <> 'refund' then
    select * into v_cat from public.categories where owner_id = new.owner_id and id = new.category_id;
    select coalesce(bool_or(p.archived_at is not null), false) into v_parent_archived from public.categories p where p.id = v_cat.parent_id;
    if (v_cat.archived_at is not null or v_parent_archived) and (tg_op = 'INSERT' or old.category_id is distinct from new.category_id) then
      raise exception 'category_archived' using errcode = '22023';
    end if;
    if (v_cat.kind = 'income' and new.nature not in ('income', 'financial'))
       or (v_cat.kind = 'expense' and new.nature not in ('expense', 'financial')) then
      raise exception 'category_kind_mismatch' using errcode = '22023';
    end if;
  end if;
  return new;
end $$;

-- View e funções da Entrega 02/03: passam a reconhecer o cartão (mesmas assinaturas e colunas,
-- novas colunas só no final da view).
create or replace view public.transactions_read with (security_invoker = true) as
select id, nature, direction, account_id, to_account_id, category_id, refund_of, description,
       amount_cents::text as amount_cents, date, status, hidden, excluded_from_reports, trashed_at, created_at,
       external_id, import_batch_id, card_id, statement_month
from public.transactions;

create or replace function public.transaction_summary(
  p_from date, p_to date, p_account uuid default null, p_category uuid default null,
  p_nature text default null, p_status text default null, p_search text default null
) returns jsonb language sql stable security invoker set search_path = '' as $$
  with f as (
    select t.nature, t.status, t.amount_cents
    from public.transactions t
    where t.owner_id = (select auth.uid())
      and t.trashed_at is null and not t.excluded_from_reports
      and t.date between p_from and p_to
      and (p_account is null or t.account_id = p_account or t.to_account_id = p_account or t.card_id = p_account)
      and (p_category is null or t.category_id = p_category
           or t.category_id in (select c.id from public.categories c where c.parent_id = p_category))
      and (p_nature is null or t.nature = p_nature)
      and (p_status is null or t.status = p_status)
      and (p_search is null or t.description ilike '%' || replace(replace(replace(p_search, '\', '\\'), '%', '\%'), '_', '\_') || '%')
  )
  select jsonb_build_object(
    'income',          coalesce(sum(amount_cents) filter (where nature = 'income'  and status = 'settled'), 0)::text,
    'expense',         coalesce(sum(amount_cents) filter (where nature = 'expense' and status = 'settled'), 0)::text,
    'refunds',         coalesce(sum(amount_cents) filter (where nature = 'refund'  and status = 'settled'), 0)::text,
    'pending_income',  coalesce(sum(amount_cents) filter (where nature = 'income'  and status = 'pending'), 0)::text,
    'pending_expense', coalesce(sum(amount_cents) filter (where nature = 'expense' and status = 'pending'), 0)::text,
    'operational_count', count(*) filter (where nature in ('income', 'expense', 'refund'))
  ) from f
$$;

create or replace function public.daily_spending(p_from date, p_to date, p_account uuid default null)
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
      and (p_account is null or t.account_id = p_account or t.card_id = p_account)
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

create or replace function public.category_totals(p_from date, p_to date, p_account uuid default null)
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
    and (p_account is null or t.account_id = p_account or t.card_id = p_account)
  group by t.category_id, 2
$$;

-- Limite de cada cartão: comprometido inclui lançamentos futuros (parcelas) e desconta só pagamentos já feitos.
create function public.card_overview()
returns table (card_id uuid, limit_cents text, committed_cents text, available_cents text)
language sql stable security invoker set search_path = '' as $$
  select c.id, c.limit_cents::text, d.committed::text, (c.limit_cents - d.committed)::text
  from public.credit_cards c
  cross join lateral (
    select coalesce(sum(case
             when t.nature = 'expense' then t.amount_cents
             when t.nature = 'refund' then -t.amount_cents
             when t.nature = 'card_payment' and t.status = 'settled' then -t.amount_cents
             else 0 end), 0) as committed
    from public.transactions t
    where t.owner_id = c.owner_id and t.card_id = c.id and t.trashed_at is null
  ) d
  where c.owner_id = (select auth.uid())
$$;
revoke all on function public.card_overview() from public, anon;
grant execute on function public.card_overview() to authenticated;

-- Totais de cada fatura do cartão. Encargos = despesas nas categorias de tarifas, juros e multas.
create function public.card_statements(p_card uuid)
returns table (statement_month date, purchases_cents text, fees_cents text, credits_cents text, paid_cents text, pending_payments_cents text, tx_count integer)
language sql stable security invoker set search_path = '' as $$
  select t.statement_month,
         coalesce(sum(t.amount_cents) filter (where t.nature = 'expense' and coalesce(c.template_key, '') not in ('financas.01', 'financas.02', 'financas.03')), 0)::text,
         coalesce(sum(t.amount_cents) filter (where t.nature = 'expense' and c.template_key in ('financas.01', 'financas.02', 'financas.03')), 0)::text,
         coalesce(sum(t.amount_cents) filter (where t.nature = 'refund'), 0)::text,
         coalesce(sum(t.amount_cents) filter (where t.nature = 'card_payment' and t.status = 'settled'), 0)::text,
         coalesce(sum(t.amount_cents) filter (where t.nature = 'card_payment' and t.status = 'pending'), 0)::text,
         count(*)::integer
  from public.transactions t
  left join public.categories c on c.owner_id = t.owner_id and c.id = t.category_id
  where t.owner_id = (select auth.uid()) and t.card_id = p_card and t.trashed_at is null
  group by t.statement_month
  order by t.statement_month
$$;
revoke all on function public.card_statements(uuid) from public, anon;
grant execute on function public.card_statements(uuid) to authenticated;
