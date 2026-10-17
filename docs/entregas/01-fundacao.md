# Entrega 01 — Fundação do FinanceOS (projeto novo)

Data: 16/10/2026 · Pasta: `C:\Users\Wanwan\Documents\FinanceOS` · Branch: `main` (primeiro commit).

## 1. O que mudou

Projeto criado do zero (Next.js 16.4.2, TypeScript, Tailwind 4, Supabase). A pasta antiga não foi usada nem alterada.

- **Login único (app pessoal):** tela Entrar com usuário e senha (`wanrley` vira `wanrley@financeos.local` no Supabase). Não há cadastro público nem recuperação por e-mail; o usuário é criado por você no painel do Supabase. Trocar senha e Sair ficam em Configurações. A senha **não** está em nenhum arquivo do projeto.
- Menu lateral no computador e menu recolhível no celular. Áreas futuras (Transações, Cartões, Parcelamentos, Assinaturas) dizem o que virá, sem dados falsos.
- **Contas:** cadastro manual por instituição (corrente, poupança, carteira digital, dinheiro), saldo inicial exato em centavos, editar, arquivar e restaurar.
- **Categorias:** 15 categorias e 141 subcategorias copiadas uma vez para cada usuário; criar, renomear e arquivar.
- **Visão geral:** saldos iniciais por conta. Resultado do mês aparece como "Sem dados", nunca como zero falso.
- **Configurações:** nome, usuário, trocar senha, sair.
- **Banco:** migration com isolamento por usuário (RLS), relações do mesmo dono, permissões por coluna e sem exclusão física.

Dependências adicionadas (versões exatas): `@supabase/ssr` e `@supabase/supabase-js` (banco e login), `zod` (validar formulários no servidor), `lucide-react` (ícones), `clsx`, `tailwind-merge` e `class-variance-authority` (padrão shadcn/ui), `vitest` e `@electric-sql/pglite` (testes, incluindo rodar o SQL num Postgres local). Recharts entra quando houver gráfico (Entrega 03).

### Arquivos

Configuração: `package.json`, `package-lock.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `vitest.config.mts`, `.gitignore`, `.env.example`.
Instruções: `AGENTS.md`, `CLAUDE.md`, `README.md`, `TAREFAS.md`, `VERIFICACOES.md`, `docs/PRODUTO.md`, `docs/SUPABASE.md`, `docs/GITHUB.md`, `docs/REFERENCIA-PIERRE.md`, `docs/entregas/01-fundacao.md`.
Banco: `supabase/migrations/20261017120000_fundacao.sql`.
Código: `src/` (rotas, ações, componentes, `lib/`), `src/proxy.ts`.
Testes e scripts: `tests/db.test.ts`, `tests/money.test.ts`, `scripts/check-supabase.mjs`, `scripts/test-rls.mjs`.

Não vão para o Git: `.env.local`, `node_modules/`, `.next/`, `next-env.d.ts` (gerado).

## 2. Como testar

```powershell
cd C:\Users\Wanwan\Documents\FinanceOS
npm run dev
```

Abra **http://127.0.0.1:3001** (a porta 3000 já está ocupada por outro programa seu).

- **Sem Supabase (agora):** `/entrar` mostra Usuário e Senha; entrar mostra "O Supabase ainda não foi configurado…". Telas internas mostram "Algo deu errado" com "Supabase não configurado". `/cadastro` → "Página não encontrada".
- **Com Supabase:** siga `docs/SUPABASE.md` do passo 1 ao 7. Entre com o usuário `wanrley` e a senha que você definiu no painel. O roteiro completo e os resultados esperados estão no passo 7.

## 3. Verificações executadas

`lint`, `typecheck`, `npm test` (16/16) e `build` passaram. Navegador: tela Entrar, `/` redirecionando, `/cadastro` inexistente, mensagens de configuração e celular 375×812 conferidos. **Pendente:** tudo que depende do Supabase real (Auth, e-mails, telas logadas, `test:rls`). Detalhes em `VERIFICACOES.md`.

## 4. GitHub passo a passo (PowerShell)

**Antes:** crie um repositório **privado e vazio** em https://github.com/new (sem README/.gitignore/licença). Nome sugerido: `financeos-app`. Copie a URL que o GitHub mostrar.

Na pasta do projeto:

```powershell
cd C:\Users\Wanwan\Documents\FinanceOS
git status
git branch --show-current
```

Esperado: branch `main`, "No commits yet" e a lista de arquivos novos (sem `.env.local`).

Adicione os arquivos da entrega, explicitamente:

```powershell
git add .gitignore .env.example package.json package-lock.json tsconfig.json next.config.ts eslint.config.mjs vitest.config.mts
git add AGENTS.md CLAUDE.md README.md TAREFAS.md VERIFICACOES.md
git add docs src supabase/migrations tests scripts
```

Confira o que entrou. `.env.local` **não** pode aparecer:

```powershell
git status
git diff --cached --stat
```

Commit (salva no computador):

```powershell
git commit -m "feat: fundacao do FinanceOS com login unico, contas e categorias"
```

Ligue ao GitHub — troque a URL pela do seu repositório:

```powershell
git remote add origin https://github.com/Wanrleycmpl/financeos-app.git
git remote -v
```

Se você usou outro nome de repositório, ajuste a URL. Se `git remote add` disser que `origin` já existe, pare e me avise.

Push (envia ao GitHub):

```powershell
git push -u origin main
```

Na primeira vez, o Git pode abrir uma janela para você entrar no GitHub.

Conferir:

```powershell
git log -1 --oneline
git status
```

Esperado: seu commit e "Your branch is up to date with 'origin/main'". No GitHub, abra o repositório → **Commits** e confira a mesma mensagem.

**Pull request:** nesta primeira entrega não há PR, porque o repositório está vazio e o commit vai direto para `main`. A partir da Entrega 02, cada entrega terá branch própria e PR para revisão (`docs/GITHUB.md`).

**Vercel:** ainda não configurada; nenhum preview nesta entrega. Ligaremos na entrega de publicação, com um Supabase de teste separado da produção.

## 5. Supabase nesta entrega

**Há SQL novo:** `supabase/migrations/20261017120000_fundacao.sql`.

- **Para que serve:** cria `profiles`, `institutions`, `accounts`, `category_templates` (catálogo 15/141) e `categories`; RLS em todas; view `accounts_read` (dinheiro como texto); função `save_account`; gatilhos que criam o perfil e copiam o catálogo quando alguém se cadastra.
- **Ambiente:** um projeto Supabase **novo**, só do FinanceOS. Não use o projeto da pasta antiga.
- **Pré-requisitos:** projeto criado, `.env.local` preenchido, CLI via `npx supabase@2.121.0`.
- **Ordem:** só este arquivo (é o primeiro). Aplique **antes** de criar o seu usuário.
- **Impacto em dados:** banco novo, nada a migrar. Se já houver usuários no Auth, eles recebem perfil e catálogo.
- **Passos exatos:** `docs/SUPABASE.md`, passos 1 a 4 (`init`, `login`, `link`, `migration list`, `db push --dry-run`, `db push`, `check:supabase`).
- **Auth no painel (passo 5):** desligar **Allow new users to sign up**; criar o usuário `wanrley@financeos.local` em Authentication → Users → Add user, com a sua senha e **Auto Confirm User** marcado. Nenhuma URL de redirecionamento é necessária (o app não envia e-mails).
- **Storage:** nada nesta entrega. O bucket privado de comprovantes entra quando houver upload.
- **Variáveis (só nomes):** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; só durante o teste de isolamento: `RLS_TEST_USER_A_EMAIL`, `RLS_TEST_USER_A_PASSWORD`, `RLS_TEST_USER_B_EMAIL`, `RLS_TEST_USER_B_PASSWORD`. Vercel: nada ainda.
- **Verificação:** consultas SQL do passo 4, `npm run test:rls` com usuários temporários (passo 6) e o roteiro da interface (passo 7). Estado: **pendente** (o projeto ainda não existe).
- **Se falhar:** o arquivo é transacional (falha = nada gravado). Me mande a saída de `migration list` e o erro. A correção será uma migration nova; nada de apagar tabelas, `db reset` remoto ou `migration repair`.

`supabase/config.toml` (criado pelo `init`) entra no commit da próxima entrega.

## 6. Pendências e próxima tarefa

1. Você: criar o repositório e fazer o push (seção 4).
2. Você: criar o Supabase de teste e aplicar a migration (seção 5).
3. Depois disso eu confiro `check:supabase`/`test:rls` com você, percorro as telas logadas e corrijo o que aparecer.
4. Em seguida, a **Entrega 02 — Transações**.
