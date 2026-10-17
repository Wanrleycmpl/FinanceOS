# Supabase — configuração, migrations e testes

Quem cria o projeto, o usuário e aplica as migrations é você. O Claude prepara o SQL e as verificações e só faz leituras anônimas (`npm run check:supabase`).

O FinanceOS é, por enquanto, **um app pessoal com um único login**. Não há cadastro público nem recuperação por e-mail: o usuário é criado por você no painel do Supabase.

O app roda em **http://127.0.0.1:3001** (a porta 3000 deste computador está ocupada por outro programa).

## 1. Criar o projeto (uma vez)

1. Em https://supabase.com/dashboard → **New project**. Nome sugerido: `financeos`. Região: South America (São Paulo). Guarde a senha do banco num gerenciador de senhas.
2. **Project Settings → API Keys**: copie a **Publishable key** (`sb_publishable_...`). Não use a secret/service_role.
3. **Project Settings → General**: anote o **Project ID** (o "project ref").
4. A URL do projeto é `https://<project-ref>.supabase.co`.

## 2. `.env.local` (fica só no seu computador)

```powershell
Copy-Item .env.example .env.local
notepad .env.local
```

Preencha `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Os campos `RLS_TEST_USER_*` ficam para o passo 6. O arquivo está no `.gitignore`; nunca cole o conteúdo no chat.

Confira (só lê, sem login):

```powershell
npm run check:supabase
```

Esperado agora: todas as linhas `AUSENTE` e "Migration 20261017120000_fundacao: NÃO aplicada".

## 3. CLI do Supabase (sem instalar dependência no projeto)

Usamos `npx` com versão fixa:

```powershell
npx supabase@2.121.0 --version
npx supabase@2.121.0 init
```

`init` cria `supabase/config.toml` e não mexe em `supabase/migrations`. Se perguntar sobre VS Code/IntelliJ/Deno, responda `N`.

```powershell
npx supabase@2.121.0 login
npx supabase@2.121.0 link --project-ref SEU_PROJECT_REF
npx supabase@2.121.0 migration list
npx supabase@2.121.0 db push --dry-run
```

- `SEU_PROJECT_REF`: troque pelo Project ID do passo 1. O `link` pede a senha do banco: digite só no terminal.
- `migration list` esperado: `20261017120000` na coluna Local e Remote vazia.
- `db push --dry-run` esperado: somente `20261017120000_fundacao.sql`. O dry-run só **lista**; não prova que o SQL funciona. Se aparecer outra coisa, pare e me mande a saída.

## 4. Aplicar

```powershell
npx supabase@2.121.0 db push
npx supabase@2.121.0 migration list
npm run check:supabase
```

Esperado: a versão nas duas colunas e "APLICADA". O arquivo roda numa transação: se falhar, nada dele fica gravado.

Consultas de conferência (SQL Editor, só leitura):

```sql
select version, name from supabase_migrations.schema_migrations order by version;

select relname, relrowsecurity from pg_class
where relnamespace = 'public'::regnamespace and relkind = 'r' order by relname;   -- todas true

select count(*) filter (where parent_key is null) as categorias,
       count(*) filter (where parent_key is not null) as subcategorias
from public.category_templates;                                                     -- 15 e 141

select tablename, policyname, cmd from pg_policies where schemaname = 'public' order by 1, 2;
```

## 5. Auth: bloquear cadastro e criar o seu login

1. **Authentication → Sign In / Providers**: desligue **Allow new users to sign up**. Assim ninguém cria conta pelo endereço do app.
2. **Authentication → Users → Add user → Create new user**:
   - Email: `wanrley@financeos.local` (é o que o app usa quando você digita o usuário `wanrley`; nenhum e-mail é enviado para esse endereço).
   - Password: a sua senha. Digite **só aqui**; ela não fica em nenhum arquivo do projeto.
   - Marque **Auto Confirm User**.
3. Se o Supabase recusar o endereço `@financeos.local`, crie o usuário com o seu e-mail real; na tela de entrada, digite o e-mail completo no campo "Usuário".

O perfil e as 15 categorias/141 subcategorias são criados automaticamente quando o usuário nasce (gatilho da migration). Por isso, **aplique a migration antes de criar o usuário**. Se criou antes, a própria migration já preenche usuários existentes ao ser aplicada.

Não há "esqueci a senha" no app. Se esquecer, defina uma nova em **Authentication → Users → (seu usuário) → Reset password / Update password**. Logado, você troca a senha em Configurações.

## 6. Teste de isolamento (opcional, recomendado uma vez)

Mesmo com um único login, as regras de isolamento protegem seus dados se alguém tentar acessar o banco com a chave publicável. Para comprovar:

1. Em **Authentication → Users → Add user**, crie dois usuários temporários com **Auto Confirm User**: `teste-a@financeos.local` e `teste-b@financeos.local`, com senhas de teste.
2. Coloque esses e-mails e senhas em `.env.local` (`RLS_TEST_USER_A_EMAIL`, `RLS_TEST_USER_A_PASSWORD`, `RLS_TEST_USER_B_EMAIL`, `RLS_TEST_USER_B_PASSWORD`).
3. Rode:

```powershell
npm run test:rls
```

Esperado: linhas `ok`, depois `PASS: isolamento entre A, B e anônimo confirmado no Supabase.` Se falhar, a linha `FAIL em "..."` diz a etapa; me mande essa linha.

4. Depois do PASS, apague os dois usuários de teste em **Authentication → Users** (os dados de teste deles vão junto) e limpe essas quatro linhas do `.env.local`. O seu usuário não é afetado.

## 7. Roteiro na interface

1. `npm run dev` → http://127.0.0.1:3001 → redireciona para **Entrar**. Usuário `wanrley` + sua senha → Visão geral. Senha errada → "Usuário ou senha incorretos."
2. Configurações: preencha seu nome → a Visão geral passa a dizer "Olá, <nome>".
3. Contas: crie "Conta principal", instituição "Banco Teste", saldo `1.234,56`, data de hoje → **R$ 1.234,56**. Edite para `-10,5` → **-R$ 10,50**. Saldo `1,234` → erro. Data futura → bloqueada.
4. Outra conta no mesmo banco → as duas agrupadas sob "Banco Teste". Arquive uma → some da lista e da Visão geral; "Mostrar arquivadas" → Restaurar.
5. Categorias: 15 principais; "Renda" tem 11 subcategorias. Crie "Bico" dentro de Renda → tipo Receita. Renomeie. Arquive "Renda" → criar subcategoria nela dá erro; Restaure.
6. Configurações → Trocar senha → saia e entre com a nova. **Sair** → volta para Entrar; abrir /visao-geral sem login → volta para Entrar.
7. Endereço `/cadastro` → "Página não encontrada".

## Se algo falhar

- Reverter código não desfaz banco, e vice-versa. Se `db push` falhar, me mande a saída de `migration list` e o erro.
- A correção é sempre uma **migration nova**. Não apague tabelas, não use `db reset` no remoto, não use `migration repair` sem revisar comigo.

## Alternativa: SQL Editor (só se você preferir)

Cole `supabase/migrations/20261017120000_fundacao.sql` inteiro no SQL Editor e execute. Isso **não** registra o histórico da CLI. Antes de usar `db push` no futuro, conferimos juntos (consultas do passo 4) e registramos a versão com `npx supabase@2.121.0 migration repair --status applied 20261017120000`. Não misture os dois métodos sem esse registro.

## Variáveis — onde cada uma vai

| Variável | `.env.local` | Vercel (futuro) | Secreta? |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | sim | sim | não |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | sim | sim | não (publicável) |
| `RLS_TEST_USER_*` | só durante o teste | **não** | sim |

A sua senha de login não é uma variável: ela existe só no Supabase.
