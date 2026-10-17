-- FinanceOS · Entrega 02 · Transações: receitas, despesas, transferências entre contas próprias,
-- estornos/cashback vinculados e movimentações financeiras (aportes, resgates, empréstimos).
-- Aplicar DEPOIS de 20261017120000_fundacao.sql. O deploy do app NÃO aplica este arquivo.
--
-- Regras:
-- * valor sempre positivo em centavos; o sentido vem de "direction" (in = entra, out = sai);
-- * transferência própria é UMA linha (sai de account_id, entra em to_account_id): não é receita nem despesa;
-- * estorno aponta para a despesa original (refund_of), herda a categoria e a soma dos estornos
--   nunca passa do valor da compra; ele reduz a despesa, não vira receita;
-- * "financial" (aporte, resgate, principal de empréstimo) mexe no saldo mas fica fora do resultado;
-- * hidden = some só da lista; excluded_from_reports = fora dos indicadores (o saldo continua);
--   trashed_at = lixeira (fora de tudo, restaurável). Não existe DELETE.

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nature text not null check (nature in ('income', 'expense', 'transfer', 'refund', 'financial')),
  direction text not null check (direction in ('in', 'out')),
  account_id uuid not null,
  to_account_id uuid,
  category_id uuid,
  refund_of uuid,
  description text not null check (char_length(btrim(description)) between 2 and 140),
  amount_cents bigint not null check (amount_cents between 1 and 99999999999999),
  date date not null check (date between date '1900-01-01' and date '2199-12-31'),
  status text not null default 'settled' check (status in ('pending', 'settled')),
  hidden boolean not null default false,
  excluded_from_reports boolean not null default false,
  trashed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, id),
  foreign key (owner_id, account_id) references public.accounts(owner_id, id),
  foreign key (owner_id, to_account_id) references public.accounts(owner_id, id),
  foreign key (owner_id, category_id) references public.categories(owner_id, id),
  foreign key (owner_id, refund_of) references public.transactions(owner_id, id),
  check ((nature = 'transfer') = (to_account_id is not null)),
  check (to_account_id is null or to_account_id <> account_id),
  check ((nature = 'refund') = (refund_of is not null)),
  check (nature = 'financial'
         or (nature in ('income', 'refund') and direction = 'in')
         or (nature in ('expense', 'transfer') and direction = 'out'))
);
create index transactions_owner_date_idx on public.transactions(owner_id, date desc, created_at desc);
create index transactions_account_idx on public.transactions(owner_id, account_id);
create index transactions_to_account_idx on public.transactions(owner_id, to_account_id) where to_account_id is not null;
create index transactions_category_idx on public.transactions(owner_id, category_id);
create index transactions_refund_idx on public.transactions(owner_id, refund_of) where refund_of is not null;

alter table public.transactions enable row level security;
create policy transactions_select on public.transactions for select to authenticated using (owner_id = (select auth.uid()));
create policy transactions_insert on public.transactions for insert to authenticated with check (owner_id = (select auth.uid()));
create policy transactions_update on public.transactions for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

revoke all on public.transactions from anon, authenticated;
grant select on public.transactions to authenticated;
grant insert (owner_id, nature, direction, account_id, to_account_id, category_id, refund_of, description, amount_cents, date, status, hidden, excluded_from_reports)
  on public.transactions to authenticated;
-- nature e refund_of não mudam depois de criados: para trocar o tipo, mande para a lixeira e crie outro.
grant update (direction, account_id, to_account_id, category_id, description, amount_cents, date, status, hidden, excluded_from_reports, trashed_at)
  on public.transactions to authenticated;

create trigger transactions_touch before update on public.transactions for each row execute function public.touch_updated_at();

-- Validações que valem para qualquer escrita (app ou chamada direta à API).
create function public.guard_transaction() returns trigger language plpgsql set search_path = '' as $$
declare
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_acc public.accounts;
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
    if v_acc.archived_at is not null and (tg_op = 'INSERT' or v_acc.id not in (old.account_id, coalesce(old.to_account_id, old.account_id))) then
      raise exception 'account_archived' using errcode = '22023';
    end if;
    if new.date < v_acc.opening_date then
      raise exception 'before_opening_date' using errcode = '22023';
    end if;
  end loop;

  -- Estorno: herda a categoria da compra e respeita o valor dela.
  if new.nature = 'refund' then
    select * into v_origin from public.transactions where owner_id = new.owner_id and id = new.refund_of for update;
    if not found or v_origin.nature <> 'expense' or v_origin.trashed_at is not null then
      raise exception 'invalid_refund_origin' using errcode = '22023';
    end if;
    if new.date < v_origin.date then raise exception 'refund_before_purchase' using errcode = '22023'; end if;
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
    if v_refunded > 0 and (new.trashed_at is not null or new.amount_cents < v_refunded) then
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
create trigger transactions_guard before insert or update on public.transactions for each row execute function public.guard_transaction();

-- Quando a compra muda de categoria, os estornos dela acompanham.
create function public.sync_refund_category() returns trigger language plpgsql set search_path = '' as $$
begin
  update public.transactions set category_id = new.category_id
    where owner_id = new.owner_id and refund_of = new.id and category_id is distinct from new.category_id;
  return null;
end $$;
create trigger transactions_sync_refunds after update of category_id on public.transactions
  for each row when (new.nature = 'expense') execute function public.sync_refund_category();

-- O saldo inicial não pode ir para depois de lançamentos já existentes na conta.
create function public.guard_account_history() returns trigger language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.transactions t where t.owner_id = new.owner_id
             and (t.account_id = new.id or t.to_account_id = new.id) and t.date < new.opening_date) then
    raise exception 'opening_date_after_transactions' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger accounts_history_guard before update of opening_date on public.accounts
  for each row execute function public.guard_account_history();

-- Leitura com dinheiro em texto (exato no JSON). security_invoker mantém a RLS.
create view public.transactions_read with (security_invoker = true) as
select id, nature, direction, account_id, to_account_id, category_id, refund_of, description,
       amount_cents::text as amount_cents, date, status, hidden, excluded_from_reports, trashed_at, created_at
from public.transactions;
revoke all on public.transactions_read from anon, authenticated;
grant select on public.transactions_read to authenticated;

-- Indicadores com os mesmos filtros da lista. Ocultos contam (ocultar é só da lista);
-- excluídos dos relatórios e lixeira não contam. Valores em texto.
create function public.transaction_summary(
  p_from date, p_to date, p_account uuid default null, p_category uuid default null,
  p_nature text default null, p_status text default null, p_search text default null
) returns jsonb language sql stable security invoker set search_path = '' as $$
  with f as (
    select t.nature, t.status, t.amount_cents
    from public.transactions t
    where t.owner_id = (select auth.uid())
      and t.trashed_at is null and not t.excluded_from_reports
      and t.date between p_from and p_to
      and (p_account is null or t.account_id = p_account or t.to_account_id = p_account)
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
revoke all on function public.transaction_summary(date, date, uuid, uuid, text, text, text) from public, anon;
grant execute on function public.transaction_summary(date, date, uuid, uuid, text, text, text) to authenticated;

-- Saldo de cada conta: saldo inicial + movimentos liquidados (fora da lixeira).
-- "Excluir dos relatórios" e "ocultar" NÃO mudam o saldo. Pendentes ficam à parte.
create function public.account_balances()
returns table (account_id uuid, balance_cents text, pending_cents text)
language sql stable security invoker set search_path = '' as $$
  select a.id,
         (a.opening_balance_cents + coalesce(sum(m.delta) filter (where m.status = 'settled'), 0))::text,
         coalesce(sum(m.delta) filter (where m.status = 'pending'), 0)::text
  from public.accounts a
  left join lateral (
    select t.status,
           case when t.to_account_id = a.id then t.amount_cents
                when t.direction = 'in' then t.amount_cents
                else -t.amount_cents end as delta
    from public.transactions t
    where t.owner_id = a.owner_id and t.trashed_at is null and (t.account_id = a.id or t.to_account_id = a.id)
  ) m on true
  where a.owner_id = (select auth.uid())
  group by a.id, a.opening_balance_cents
$$;
revoke all on function public.account_balances() from public, anon;
grant execute on function public.account_balances() to authenticated;
