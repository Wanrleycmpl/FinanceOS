-- FinanceOS · Entrega 05 · Parcelamentos.
-- Aplicar DEPOIS de 20261017210000_cartoes.sql. Só adiciona/estende; nada é apagado.
--
-- Regras:
-- * um plano gera N parcelas (lançamentos de despesa). NÃO existe "compra-mãe" somada:
--   o gasto aparece parcela a parcela, cada uma no seu mês;
-- * o total é dividido em centavos exatos, com o resto nas primeiras parcelas
--   (R$ 100,00 em 3 = 33,34 + 33,33 + 33,33); a soma sempre fecha no total;
-- * parcelas na conta (carnê/boleto) ficam PENDENTES até você confirmar o pagamento:
--   data passada não prova pagamento;
-- * parcelas no cartão são cobranças certas nas faturas: entram liquidadas, comprometem o limite
--   e são "pagas" quando a fatura delas é paga;
-- * valor e meio de cada parcela só mudam pelo plano; cancelar manda as parcelas futuras para a
--   lixeira e, se pedido, estorna as já cobradas, sem contar nada duas vezes.

create table public.installment_plans (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  description text not null check (char_length(btrim(description)) between 2 and 120),
  total_cents bigint not null check (total_cents between 2 and 99999999999999),
  installments_count integer not null check (installments_count between 2 and 72),
  first_date date not null,
  account_id uuid,
  card_id uuid,
  category_id uuid,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  unique (owner_id, id),
  check ((account_id is null) <> (card_id is null)),
  check (total_cents >= installments_count),
  foreign key (owner_id, account_id) references public.accounts(owner_id, id),
  foreign key (owner_id, card_id) references public.credit_cards(owner_id, id),
  foreign key (owner_id, category_id) references public.categories(owner_id, id)
);
alter table public.installment_plans enable row level security;
create policy installment_plans_select on public.installment_plans for select to authenticated using (owner_id = (select auth.uid()));
revoke all on public.installment_plans from anon, authenticated;
grant select on public.installment_plans to authenticated;
-- Criar e cancelar só pelas funções abaixo (garantem que as parcelas fechem no total).

alter table public.transactions
  add column plan_id uuid,
  add column installment_number integer check (installment_number between 1 and 72),
  add constraint transactions_plan_fk foreign key (owner_id, plan_id) references public.installment_plans(owner_id, id),
  add constraint transactions_plan_check check ((plan_id is null) = (installment_number is null));
create unique index transactions_plan_number_idx on public.transactions(owner_id, plan_id, installment_number) where plan_id is not null;
-- Sem permissão de gravar plan_id/installment_number pelo cliente.

create or replace view public.transactions_read with (security_invoker = true) as
select id, nature, direction, account_id, to_account_id, category_id, refund_of, description,
       amount_cents::text as amount_cents, date, status, hidden, excluded_from_reports, trashed_at, created_at,
       external_id, import_batch_id, card_id, statement_month, plan_id, installment_number
from public.transactions;

-- Validações (substitui a versão da Entrega 04, mantendo todas as regras anteriores).
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
  -- Parcela de cartão é cobrança certa nas faturas futuras: pode ser registrada já como liquidada.
  if new.status = 'settled' and new.date > v_today and not (new.plan_id is not null and new.card_id is not null) then
    raise exception 'settled_in_future' using errcode = '22023', hint = 'Lançamento futuro deve ficar pendente.';
  end if;

  -- Parcelas: valor e meio só mudam pelo plano; lixeira só cancelando o plano (o total sempre fecha).
  if tg_op = 'UPDATE' and old.plan_id is not null then
    if new.amount_cents <> old.amount_cents or new.account_id is distinct from old.account_id or new.card_id is distinct from old.card_id
       or (old.card_id is not null and new.status <> old.status) then
      raise exception 'installment_locked' using errcode = '22023';
    end if;
    if (new.trashed_at is null) <> (old.trashed_at is null)
       and not exists (select 1 from public.installment_plans p where p.owner_id = new.owner_id and p.id = old.plan_id and p.cancelled_at is not null and new.trashed_at is not null) then
      raise exception 'installment_locked' using errcode = '22023';
    end if;
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

-- Cria o plano e todas as parcelas numa única transação.
-- security definer: grava plan_id (que o cliente não pode gravar). O dono vem de auth.uid() e as
-- FKs compostas garantem que conta, cartão e categoria são do mesmo usuário; os gatilhos validam o resto.
create function public.create_installment_plan(
  p_description text, p_total_cents bigint, p_count integer, p_first_date date,
  p_account uuid, p_card uuid, p_category uuid, p_paid_count integer default 0
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid := auth.uid();
  v_plan uuid;
  v_base bigint;
  v_rest bigint;
  i integer;
begin
  if v_owner is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_count is null or p_count not between 2 and 72 then raise exception 'invalid_installments' using errcode = '22023'; end if;
  if p_total_cents is null or p_total_cents < p_count or p_total_cents > 99999999999999 then raise exception 'invalid_total' using errcode = '22023'; end if;
  if (p_account is null) = (p_card is null) then raise exception 'choose_account_or_card' using errcode = '22023'; end if;
  if p_paid_count is null or p_paid_count < 0 or p_paid_count > p_count or (p_card is not null and p_paid_count <> 0) then
    raise exception 'invalid_paid_count' using errcode = '22023';
  end if;

  insert into public.installment_plans (owner_id, description, total_cents, installments_count, first_date, account_id, card_id, category_id)
    values (v_owner, btrim(p_description), p_total_cents, p_count, p_first_date, p_account, p_card, p_category)
    returning id into v_plan;

  v_base := p_total_cents / p_count;
  v_rest := p_total_cents % p_count; -- os centavos que sobram vão para as primeiras parcelas
  for i in 1..p_count loop
    insert into public.transactions (owner_id, nature, direction, account_id, card_id, category_id, description, amount_cents, date, status, plan_id, installment_number)
      values (v_owner, 'expense', 'out', p_account, p_card, p_category,
              left(btrim(p_description), 120) || ' (' || i || '/' || p_count || ')',
              v_base + case when i <= v_rest then 1 else 0 end,
              (p_first_date + make_interval(months => i - 1))::date,
              case when p_card is not null or i <= p_paid_count then 'settled' else 'pending' end,
              v_plan, i);
  end loop;
  return v_plan;
end $$;
revoke all on function public.create_installment_plan(text, bigint, integer, date, uuid, uuid, uuid, integer) from public, anon;
grant execute on function public.create_installment_plan(text, bigint, integer, date, uuid, uuid, uuid, integer) to authenticated;

-- Cancela: parcelas ainda não cobradas/pagas vão para a lixeira; com p_refund_charged, as já
-- cobradas/pagas recebem estorno do valor que ainda não foi estornado (nunca mais que isso).
create function public.cancel_installment_plan(p_plan uuid, p_refund_charged boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid := auth.uid();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_plan public.installment_plans;
  r public.transactions;
  v_left bigint;
begin
  if v_owner is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into v_plan from public.installment_plans where owner_id = v_owner and id = p_plan for update;
  if not found then raise exception 'plan_not_found' using errcode = 'P0002'; end if;
  if v_plan.cancelled_at is not null then raise exception 'plan_already_cancelled' using errcode = '22023'; end if;

  update public.installment_plans set cancelled_at = now() where id = p_plan;
  update public.transactions set trashed_at = now()
    where owner_id = v_owner and plan_id = p_plan and trashed_at is null
      and case when card_id is not null then date > v_today else status = 'pending' end;

  if p_refund_charged then
    for r in select * from public.transactions where owner_id = v_owner and plan_id = p_plan and trashed_at is null order by installment_number loop
      select r.amount_cents - coalesce(sum(t.amount_cents), 0) into v_left
        from public.transactions t where t.owner_id = v_owner and t.refund_of = r.id and t.trashed_at is null;
      if v_left > 0 then
        insert into public.transactions (owner_id, nature, direction, account_id, card_id, refund_of, description, amount_cents, date, status)
          values (v_owner, 'refund', 'in', r.account_id, r.card_id, r.id, left('Estorno: ' || r.description, 140), v_left, greatest(v_today, r.date), 'settled');
      end if;
    end loop;
  end if;
end $$;
revoke all on function public.cancel_installment_plan(uuid, boolean) from public, anon;
grant execute on function public.cancel_installment_plan(uuid, boolean) to authenticated;
