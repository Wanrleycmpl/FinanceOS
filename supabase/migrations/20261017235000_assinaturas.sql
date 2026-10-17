-- FinanceOS · Entrega 06 · Assinaturas pessoais (streaming, apps, academia...).
-- Aplicar DEPOIS de 20261017230000_parcelamentos.sql. Só adiciona; nada é apagado.
-- (A assinatura paga para usar o FinanceOS como SaaS será outra coisa, em outra entrega.)
--
-- Regras:
-- * a assinatura é só um CADASTRO com a previsão da próxima cobrança: previsão não é despesa;
-- * a despesa nasce quando você registra a cobrança real ("Registrar cobrança"), que cria UM
--   lançamento ligado à assinatura e avança a próxima cobrança, tudo junto;
-- * pausada/cancelada não gera previsão; o histórico de cobranças continua.

create table public.personal_subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 80),
  amount_cents bigint not null check (amount_cents between 1 and 99999999999999),
  period text not null check (period in ('weekly', 'monthly', 'quarterly', 'semiannual', 'annual')),
  anchor_day smallint not null check (anchor_day between 1 and 31), -- dia do mês da cobrança (meses curtos usam o último dia)
  next_charge_date date not null,
  account_id uuid,
  card_id uuid,
  category_id uuid,
  status text not null default 'active' check (status in ('active', 'paused', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, id),
  check ((account_id is null) <> (card_id is null)),
  foreign key (owner_id, account_id) references public.accounts(owner_id, id),
  foreign key (owner_id, card_id) references public.credit_cards(owner_id, id),
  foreign key (owner_id, category_id) references public.categories(owner_id, id)
);
alter table public.personal_subscriptions enable row level security;
create policy personal_subscriptions_select on public.personal_subscriptions for select to authenticated using (owner_id = (select auth.uid()));
create policy personal_subscriptions_insert on public.personal_subscriptions for insert to authenticated with check (owner_id = (select auth.uid()));
create policy personal_subscriptions_update on public.personal_subscriptions for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
revoke all on public.personal_subscriptions from anon, authenticated;
grant select on public.personal_subscriptions to authenticated;
grant insert (owner_id, name, amount_cents, period, anchor_day, next_charge_date, account_id, card_id, category_id, status) on public.personal_subscriptions to authenticated;
grant update (name, amount_cents, period, anchor_day, next_charge_date, account_id, card_id, category_id, status) on public.personal_subscriptions to authenticated;
create trigger personal_subscriptions_touch before update on public.personal_subscriptions for each row execute function public.touch_updated_at();

-- Cobranças efetivas ficam ligadas à assinatura (para o histórico).
alter table public.transactions
  add column subscription_id uuid,
  add constraint transactions_subscription_fk foreign key (owner_id, subscription_id) references public.personal_subscriptions(owner_id, id);
create index transactions_subscription_idx on public.transactions(owner_id, subscription_id) where subscription_id is not null;
grant insert (subscription_id) on public.transactions to authenticated;

create or replace view public.transactions_read with (security_invoker = true) as
select id, nature, direction, account_id, to_account_id, category_id, refund_of, description,
       amount_cents::text as amount_cents, date, status, hidden, excluded_from_reports, trashed_at, created_at,
       external_id, import_batch_id, card_id, statement_month, plan_id, installment_number, subscription_id
from public.transactions;

-- Próxima data depois de p_date, mantendo o dia da cobrança (31 → 28/02 → 31/03).
create function public.subscription_next(p_date date, p_period text, p_anchor integer) returns date
language plpgsql immutable set search_path = '' as $$
declare v_months integer; v_first date; v_last integer;
begin
  if p_period = 'weekly' then return p_date + 7; end if;
  v_months := case p_period when 'monthly' then 1 when 'quarterly' then 3 when 'semiannual' then 6 else 12 end;
  v_first := (date_trunc('month', p_date) + make_interval(months => v_months))::date;
  v_last := extract(day from (v_first + interval '1 month - 1 day'))::integer;
  return v_first + (least(p_anchor, v_last) - 1);
end $$;

-- Registra a cobrança real: cria a despesa (na conta ou no cartão da assinatura) e avança a próxima data.
create function public.register_subscription_charge(p_subscription uuid, p_date date, p_amount_cents bigint)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_owner uuid := auth.uid();
  v_sub public.personal_subscriptions;
  v_tx uuid;
  v_next date;
begin
  if v_owner is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into v_sub from public.personal_subscriptions where owner_id = v_owner and id = p_subscription for update;
  if not found then raise exception 'subscription_not_found' using errcode = 'P0002'; end if;
  if v_sub.status <> 'active' then raise exception 'subscription_not_active' using errcode = '22023'; end if;

  insert into public.transactions (owner_id, nature, direction, account_id, card_id, category_id, description, amount_cents, date, status, subscription_id)
    values (v_owner, 'expense', 'out', v_sub.account_id, v_sub.card_id, v_sub.category_id, v_sub.name, p_amount_cents, p_date, 'settled', v_sub.id)
    returning id into v_tx;

  -- Avança a partir da cobrança prevista (ou da data paga, se for depois), até ficar no futuro em relação a ela.
  v_next := v_sub.next_charge_date;
  while v_next <= greatest(p_date, v_sub.next_charge_date) loop
    v_next := public.subscription_next(v_next, v_sub.period, v_sub.anchor_day);
  end loop;
  update public.personal_subscriptions set next_charge_date = v_next where id = v_sub.id;
  return v_tx;
end $$;
revoke all on function public.register_subscription_charge(uuid, date, bigint) from public, anon;
grant execute on function public.register_subscription_charge(uuid, date, bigint) to authenticated;
