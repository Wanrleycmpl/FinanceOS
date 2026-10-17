-- FinanceOS · Entrega 01 · Fundação: perfis, instituições, contas e categorias.
-- Aplique primeiro em um projeto Supabase de TESTE. O deploy do app NÃO aplica este arquivo.
-- Regras: dinheiro em centavos (bigint), datas sem horário, RLS em todas as tabelas,
-- relações com o mesmo dono por FK composta (owner_id, id), nada é apagado (arquivamento).

-- Perfis --------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 60),
  categories_seeded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Instituições e contas -----------------------------------------------------
create table public.institutions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 80),
  name_key text generated always as (lower(btrim(name))) stored,
  created_at timestamptz not null default now(),
  unique (owner_id, id),
  unique (owner_id, name_key)
);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  institution_id uuid not null,
  name text not null check (char_length(btrim(name)) between 2 and 60),
  kind text not null check (kind in ('checking', 'savings', 'wallet', 'cash')),
  -- Limite: ± R$ 999.999.999.999,99.
  opening_balance_cents bigint not null default 0
    check (opening_balance_cents between -99999999999999 and 99999999999999),
  opening_date date not null check (opening_date >= date '1900-01-01'),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, id),
  foreign key (owner_id, institution_id) references public.institutions(owner_id, id)
);
create index accounts_owner_idx on public.accounts(owner_id, archived_at);

-- Catálogo de categorias (modelo global, somente leitura) -------------------
create table public.category_templates (
  key text primary key,
  parent_key text references public.category_templates(key),
  name text not null,
  kind text not null check (kind in ('expense', 'income', 'mixed')),
  sort_order integer not null
);

-- Categorias de cada usuário (cópia do catálogo + próprias) -----------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  parent_id uuid,
  name text not null check (char_length(btrim(name)) between 2 and 60),
  kind text not null check (kind in ('expense', 'income', 'mixed')),
  template_key text references public.category_templates(key),
  sort_order integer not null default 1000,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, id),
  unique (owner_id, template_key),
  foreign key (owner_id, parent_id) references public.categories(owner_id, id),
  check (parent_id is null or parent_id <> id)
);
create unique index categories_name_idx on public.categories
  (owner_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(btrim(name)));
create index categories_parent_idx on public.categories(owner_id, parent_id);

-- RLS e permissões ----------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.institutions enable row level security;
alter table public.accounts enable row level security;
alter table public.category_templates enable row level security;
alter table public.categories enable row level security;

create policy profiles_select on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy institutions_select on public.institutions for select to authenticated using (owner_id = (select auth.uid()));
create policy institutions_insert on public.institutions for insert to authenticated with check (owner_id = (select auth.uid()));
create policy institutions_update on public.institutions for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy accounts_select on public.accounts for select to authenticated using (owner_id = (select auth.uid()));
create policy accounts_insert on public.accounts for insert to authenticated with check (owner_id = (select auth.uid()));
create policy accounts_update on public.accounts for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy category_templates_select on public.category_templates for select to authenticated using (true);

create policy categories_select on public.categories for select to authenticated using (owner_id = (select auth.uid()));
create policy categories_insert on public.categories for insert to authenticated with check (owner_id = (select auth.uid()));
create policy categories_update on public.categories for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- O Supabase concede tudo por padrão; aqui só o necessário, coluna a coluna. Sem DELETE.
revoke all on public.profiles, public.institutions, public.accounts, public.category_templates, public.categories from anon, authenticated;
grant select on public.profiles, public.institutions, public.accounts, public.category_templates, public.categories to authenticated;
grant update (display_name) on public.profiles to authenticated;
grant insert (owner_id, name), update (name) on public.institutions to authenticated;
grant insert (owner_id, institution_id, name, kind, opening_balance_cents, opening_date),
      update (institution_id, name, kind, opening_balance_cents, opening_date, archived_at) on public.accounts to authenticated;
-- O cliente não grava template_key; parent_id e kind não mudam depois de criados.
grant insert (owner_id, parent_id, name, kind), update (name, sort_order, archived_at) on public.categories to authenticated;

-- Leitura de contas com dinheiro em TEXTO (bigint exato no JSON). security_invoker mantém a RLS.
create view public.accounts_read with (security_invoker = true) as
select a.id, a.institution_id, i.name as institution_name, a.name, a.kind,
       a.opening_balance_cents::text as opening_balance_cents, a.opening_date, a.archived_at, a.created_at
from public.accounts a
join public.institutions i on i.owner_id = a.owner_id and i.id = a.institution_id;
revoke all on public.accounts_read from anon, authenticated;
grant select on public.accounts_read to authenticated;

-- Gatilhos ------------------------------------------------------------------
create function public.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger accounts_touch before update on public.accounts for each row execute function public.touch_updated_at();
create trigger categories_touch before update on public.categories for each row execute function public.touch_updated_at();

-- Data do saldo inicial não pode estar no futuro (calendário de Brasília).
create function public.guard_account() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.opening_date > (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'opening_date_in_future' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger accounts_guard before insert or update on public.accounts for each row execute function public.guard_account();

-- Hierarquia de dois níveis; subcategoria herda o tipo da categoria-pai.
create function public.guard_category() returns trigger language plpgsql set search_path = '' as $$
declare v_parent public.categories;
begin
  if new.parent_id is not null then
    select * into v_parent from public.categories where id = new.parent_id and owner_id = new.owner_id;
    if not found then raise exception 'parent_not_found' using errcode = '23503'; end if;
    if v_parent.parent_id is not null then raise exception 'max_depth' using errcode = '22023'; end if;
    if v_parent.archived_at is not null then raise exception 'parent_archived' using errcode = '22023'; end if;
    new.kind := v_parent.kind;
  end if;
  return new;
end $$;
create trigger categories_guard before insert on public.categories for each row execute function public.guard_category();

-- Funções -------------------------------------------------------------------
-- Copia o catálogo uma única vez por usuário (marcado em profiles.categories_seeded_at).
create function public.seed_default_categories(p_owner uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.profiles where id = p_owner and categories_seeded_at is not null) then return; end if;
  insert into public.categories (owner_id, name, kind, template_key, sort_order)
    select p_owner, t.name, t.kind, t.key, t.sort_order from public.category_templates t where t.parent_key is null
    on conflict (owner_id, template_key) do nothing;
  insert into public.categories (owner_id, parent_id, name, kind, template_key, sort_order)
    select p_owner, p.id, t.name, t.kind, t.key, t.sort_order
    from public.category_templates t
    join public.categories p on p.owner_id = p_owner and p.template_key = t.parent_key
    where t.parent_key is not null
    on conflict (owner_id, template_key) do nothing;
  update public.profiles set categories_seeded_at = now() where id = p_owner;
end $$;
revoke all on function public.seed_default_categories(uuid) from public, anon, authenticated;

-- Novo usuário do Auth: cria perfil e copia o catálogo.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
    values (new.id, left(coalesce(btrim(new.raw_user_meta_data ->> 'display_name'), ''), 60))
    on conflict (id) do nothing;
  perform public.seed_default_categories(new.id);
  return new;
end $$;
revoke all on function public.handle_new_user() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Cria/edita conta e instituição juntas (atômico). security invoker: a RLS vale aqui dentro.
create function public.save_account(
  p_id uuid, p_institution text, p_name text, p_kind text, p_opening_balance_cents bigint, p_opening_date date
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_owner uuid := auth.uid(); v_institution uuid; v_id uuid;
begin
  if v_owner is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  insert into public.institutions (owner_id, name) values (v_owner, btrim(p_institution))
    on conflict (owner_id, name_key) do update set name = excluded.name
    returning id into v_institution;
  if p_id is null then
    insert into public.accounts (owner_id, institution_id, name, kind, opening_balance_cents, opening_date)
      values (v_owner, v_institution, btrim(p_name), p_kind, p_opening_balance_cents, p_opening_date)
      returning id into v_id;
  else
    update public.accounts
      set institution_id = v_institution, name = btrim(p_name), kind = p_kind,
          opening_balance_cents = p_opening_balance_cents, opening_date = p_opening_date
      where id = p_id and owner_id = v_owner
      returning id into v_id;
    if v_id is null then raise exception 'account_not_found' using errcode = 'P0002'; end if;
  end if;
  return v_id;
end $$;
revoke all on function public.save_account(uuid, text, text, text, bigint, date) from public, anon;
grant execute on function public.save_account(uuid, text, text, text, bigint, date) to authenticated;

-- Catálogo inicial: 15 categorias e 141 subcategorias -----------------------
insert into public.category_templates(key, parent_key, name, kind, sort_order) values
  ('alimentacao', null, 'Alimentação', 'expense', 1),
  ('alimentacao.01', 'alimentacao', 'Alimentos e bebidas', 'expense', 1),
  ('alimentacao.02', 'alimentacao', 'Delivery de alimentos', 'expense', 2),
  ('alimentacao.03', 'alimentacao', 'Restaurantes', 'expense', 3),
  ('alimentacao.04', 'alimentacao', 'Bares e lanchonetes', 'expense', 4),
  ('alimentacao.05', 'alimentacao', 'Supermercado', 'expense', 5),
  ('alimentacao.06', 'alimentacao', 'Padarias e cafeterias', 'expense', 6),
  ('alimentacao.07', 'alimentacao', 'Feiras e hortifrúti', 'expense', 7),
  ('alimentacao.08', 'alimentacao', 'Açougues e peixarias', 'expense', 8),
  ('alimentacao.09', 'alimentacao', 'Refeições no trabalho', 'expense', 9),
  ('alimentacao.10', 'alimentacao', 'Outros gastos com alimentação', 'expense', 10),
  ('compras', null, 'Compras', 'expense', 2),
  ('compras.01', 'compras', 'Compras gerais', 'expense', 1),
  ('compras.02', 'compras', 'Artigos esportivos', 'expense', 2),
  ('compras.03', 'compras', 'Artigos infantis', 'expense', 3),
  ('compras.04', 'compras', 'Cashbacks', 'expense', 4),
  ('compras.05', 'compras', 'Compras online', 'expense', 5),
  ('compras.06', 'compras', 'Eletrônicos', 'expense', 6),
  ('compras.07', 'compras', 'Livraria', 'expense', 7),
  ('compras.08', 'compras', 'Papelaria', 'expense', 8),
  ('compras.09', 'compras', 'Pet shops e veterinários', 'expense', 9),
  ('compras.10', 'compras', 'Vestuário', 'expense', 10),
  ('compras.11', 'compras', 'Calçados e acessórios', 'expense', 11),
  ('compras.12', 'compras', 'Cosméticos e perfumaria', 'expense', 12),
  ('compras.13', 'compras', 'Presentes', 'expense', 13),
  ('compras.14', 'compras', 'Móveis e eletrodomésticos', 'expense', 14),
  ('compras.15', 'compras', 'Outras compras', 'expense', 15),
  ('saude', null, 'Saúde e bem-estar', 'expense', 3),
  ('saude.01', 'saude', 'Consultas médicas', 'expense', 1),
  ('saude.02', 'saude', 'Exames e diagnósticos', 'expense', 2),
  ('saude.03', 'saude', 'Medicamentos e farmácia', 'expense', 3),
  ('saude.04', 'saude', 'Odontologia', 'expense', 4),
  ('saude.05', 'saude', 'Terapia e psicologia', 'expense', 5),
  ('saude.06', 'saude', 'Fisioterapia', 'expense', 6),
  ('saude.07', 'saude', 'Academia e atividades físicas', 'expense', 7),
  ('saude.08', 'saude', 'Cuidados pessoais e estética', 'expense', 8),
  ('saude.09', 'saude', 'Óticas', 'expense', 9),
  ('saude.10', 'saude', 'Outros gastos com saúde', 'expense', 10),
  ('digitais', null, 'Serviços digitais', 'expense', 4),
  ('digitais.01', 'digitais', 'Software e aplicativos', 'expense', 1),
  ('digitais.02', 'digitais', 'Ferramentas de IA', 'expense', 2),
  ('digitais.03', 'digitais', 'Armazenamento em nuvem', 'expense', 3),
  ('digitais.04', 'digitais', 'Domínios e hospedagem', 'expense', 4),
  ('digitais.05', 'digitais', 'Streaming de vídeo', 'expense', 5),
  ('digitais.06', 'digitais', 'Streaming de música', 'expense', 6),
  ('digitais.07', 'digitais', 'Assinaturas de conteúdo', 'expense', 7),
  ('digitais.08', 'digitais', 'Serviços profissionais online', 'expense', 8),
  ('digitais.09', 'digitais', 'Outros serviços digitais', 'expense', 9),
  ('transporte', null, 'Transporte', 'expense', 5),
  ('transporte.01', 'transporte', 'Táxi e transporte por aplicativo', 'expense', 1),
  ('transporte.02', 'transporte', 'Ônibus e metrô', 'expense', 2),
  ('transporte.03', 'transporte', 'Combustível', 'expense', 3),
  ('transporte.04', 'transporte', 'Estacionamento', 'expense', 4),
  ('transporte.05', 'transporte', 'Pedágios', 'expense', 5),
  ('transporte.06', 'transporte', 'Manutenção de veículo', 'expense', 6),
  ('transporte.07', 'transporte', 'Aluguel de veículo', 'expense', 7),
  ('transporte.08', 'transporte', 'Passagens aéreas e rodoviárias', 'expense', 8),
  ('transporte.09', 'transporte', 'Bicicletas e micromobilidade', 'expense', 9),
  ('transporte.10', 'transporte', 'Outros gastos com transporte', 'expense', 10),
  ('moradia', null, 'Moradia', 'expense', 6),
  ('moradia.01', 'moradia', 'Aluguel', 'expense', 1),
  ('moradia.02', 'moradia', 'Condomínio', 'expense', 2),
  ('moradia.03', 'moradia', 'Energia elétrica', 'expense', 3),
  ('moradia.04', 'moradia', 'Água e esgoto', 'expense', 4),
  ('moradia.05', 'moradia', 'Gás', 'expense', 5),
  ('moradia.06', 'moradia', 'Internet residencial', 'expense', 6),
  ('moradia.07', 'moradia', 'Celular e telefonia', 'expense', 7),
  ('moradia.08', 'moradia', 'Reparos e manutenção', 'expense', 8),
  ('moradia.09', 'moradia', 'Limpeza e serviços domésticos', 'expense', 9),
  ('moradia.10', 'moradia', 'Jardinagem', 'expense', 10),
  ('moradia.11', 'moradia', 'Outros gastos com moradia', 'expense', 11),
  ('lazer', null, 'Lazer e entretenimento', 'expense', 7),
  ('lazer.01', 'lazer', 'Cinema e teatro', 'expense', 1),
  ('lazer.02', 'lazer', 'Shows e festivais', 'expense', 2),
  ('lazer.03', 'lazer', 'Passeios e atrações', 'expense', 3),
  ('lazer.04', 'lazer', 'Viagens e hospedagem', 'expense', 4),
  ('lazer.05', 'lazer', 'Clubes e eventos', 'expense', 5),
  ('lazer.06', 'lazer', 'Hobbies', 'expense', 6),
  ('lazer.07', 'lazer', 'Jogos e videogames sem aposta', 'expense', 7),
  ('lazer.08', 'lazer', 'Esportes e lazer', 'expense', 8),
  ('lazer.09', 'lazer', 'Outros gastos com lazer', 'expense', 9),
  ('financas', null, 'Finanças', 'mixed', 8),
  ('financas.01', 'financas', 'Tarifas bancárias', 'mixed', 1),
  ('financas.02', 'financas', 'Juros e encargos', 'mixed', 2),
  ('financas.03', 'financas', 'Multas financeiras', 'mixed', 3),
  ('financas.04', 'financas', 'Serviços financeiros', 'mixed', 4),
  ('financas.05', 'financas', 'Transferências entre contas próprias', 'mixed', 5),
  ('financas.06', 'financas', 'Transferências para terceiros', 'mixed', 6),
  ('financas.07', 'financas', 'Aportes em investimentos', 'mixed', 7),
  ('financas.08', 'financas', 'Resgates de investimentos', 'mixed', 8),
  ('financas.09', 'financas', 'Empréstimos recebidos', 'mixed', 9),
  ('financas.10', 'financas', 'Amortização de empréstimos', 'mixed', 10),
  ('financas.11', 'financas', 'Pagamento de fatura', 'mixed', 11),
  ('financas.12', 'financas', 'Outras movimentações financeiras', 'mixed', 12),
  ('renda', null, 'Renda', 'income', 9),
  ('renda.01', 'renda', 'Salário', 'income', 1),
  ('renda.02', 'renda', 'Pró-labore', 'income', 2),
  ('renda.03', 'renda', 'Freelance e serviços', 'income', 3),
  ('renda.04', 'renda', 'Vendas', 'income', 4),
  ('renda.05', 'renda', 'Aluguéis recebidos', 'income', 5),
  ('renda.06', 'renda', 'Juros e rendimentos', 'income', 6),
  ('renda.07', 'renda', 'Dividendos', 'income', 7),
  ('renda.08', 'renda', 'Benefícios e auxílios', 'income', 8),
  ('renda.09', 'renda', 'Bonificações e comissões', 'income', 9),
  ('renda.10', 'renda', 'Presentes recebidos', 'income', 10),
  ('renda.11', 'renda', 'Outras receitas', 'income', 11),
  ('educacao', null, 'Educação', 'expense', 10),
  ('educacao.01', 'educacao', 'Escola', 'expense', 1),
  ('educacao.02', 'educacao', 'Faculdade e pós-graduação', 'expense', 2),
  ('educacao.03', 'educacao', 'Cursos e certificações', 'expense', 3),
  ('educacao.04', 'educacao', 'Idiomas', 'expense', 4),
  ('educacao.05', 'educacao', 'Aulas particulares', 'expense', 5),
  ('educacao.06', 'educacao', 'Material didático', 'expense', 6),
  ('educacao.07', 'educacao', 'Eventos e congressos', 'expense', 7),
  ('educacao.08', 'educacao', 'Plataformas educacionais', 'expense', 8),
  ('educacao.09', 'educacao', 'Outros gastos com educação', 'expense', 9),
  ('impostos', null, 'Impostos e taxas', 'expense', 11),
  ('impostos.01', 'impostos', 'Imposto de renda', 'expense', 1),
  ('impostos.02', 'impostos', 'DAS e MEI', 'expense', 2),
  ('impostos.03', 'impostos', 'IPTU', 'expense', 3),
  ('impostos.04', 'impostos', 'IPVA e licenciamento', 'expense', 4),
  ('impostos.05', 'impostos', 'ISS e tributos de serviços', 'expense', 5),
  ('impostos.06', 'impostos', 'Taxas de documentos', 'expense', 6),
  ('impostos.07', 'impostos', 'Taxas públicas', 'expense', 7),
  ('impostos.08', 'impostos', 'Outros impostos e taxas', 'expense', 8),
  ('seguros', null, 'Seguros', 'expense', 12),
  ('seguros.01', 'seguros', 'Seguro de automóvel', 'expense', 1),
  ('seguros.02', 'seguros', 'Seguro residencial', 'expense', 2),
  ('seguros.03', 'seguros', 'Seguro de vida', 'expense', 3),
  ('seguros.04', 'seguros', 'Plano e seguro de saúde', 'expense', 4),
  ('seguros.05', 'seguros', 'Seguro odontológico', 'expense', 5),
  ('seguros.06', 'seguros', 'Seguro de viagem', 'expense', 6),
  ('seguros.07', 'seguros', 'Seguro de equipamentos', 'expense', 7),
  ('seguros.08', 'seguros', 'Outros seguros', 'expense', 8),
  ('apostas', null, 'Apostas e jogos', 'mixed', 13),
  ('apostas.01', 'apostas', 'Apostas esportivas', 'mixed', 1),
  ('apostas.02', 'apostas', 'Loterias', 'mixed', 2),
  ('apostas.03', 'apostas', 'Jogos de cassino', 'mixed', 3),
  ('apostas.04', 'apostas', 'Bolões', 'mixed', 4),
  ('apostas.05', 'apostas', 'Outras apostas', 'mixed', 5),
  ('apostas.06', 'apostas', 'Prêmios de apostas e jogos', 'mixed', 6),
  ('doacoes', null, 'Doações', 'expense', 14),
  ('doacoes.01', 'doacoes', 'Instituições e ONGs', 'expense', 1),
  ('doacoes.02', 'doacoes', 'Doações religiosas', 'expense', 2),
  ('doacoes.03', 'doacoes', 'Campanhas e vaquinhas', 'expense', 3),
  ('doacoes.04', 'doacoes', 'Ajuda a pessoas', 'expense', 4),
  ('doacoes.05', 'doacoes', 'Doações recorrentes', 'expense', 5),
  ('doacoes.06', 'doacoes', 'Outras doações', 'expense', 6),
  ('outros', null, 'Outros', 'mixed', 15),
  ('outros.01', 'outros', 'Serviços diversos', 'mixed', 1),
  ('outros.02', 'outros', 'Despesas diversas', 'mixed', 2),
  ('outros.03', 'outros', 'Receitas diversas', 'mixed', 3),
  ('outros.04', 'outros', 'Reembolsos recebidos', 'mixed', 4),
  ('outros.05', 'outros', 'Estornos de compras', 'mixed', 5),
  ('outros.06', 'outros', 'Ajustes de saldo', 'mixed', 6),
  ('outros.07', 'outros', 'Não categorizado', 'mixed', 7);

-- Usuários que já existiam antes desta migration também recebem perfil e catálogo.
insert into public.profiles (id) select id from auth.users on conflict (id) do nothing;
select public.seed_default_categories(id) from auth.users;
