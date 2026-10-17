@AGENTS.md

# FinanceOS — regras permanentes

SaaS de finanças pessoais para brasileiros, hoje usado como app pessoal com **um único login** (usuário criado no painel do Supabase; cadastro público desligado; senha nunca em arquivos). O dono do projeto é iniciante: explique em português simples. Marca **FinanceOS** até pedido de mudança. Escopo e roteiro: `docs/PRODUTO.md`. Estado real: `TAREFAS.md` e `VERIFICACOES.md`.

## Arquitetura
- Um único Next.js 16 (App Router, TypeScript) + Supabase (Postgres, Auth, Storage). Sem Express, microsserviços ou filas.
- Antes de escrever código Next.js, leia o guia pertinente em `node_modules/next/dist/docs/` (ver `AGENTS.md`). `cacheComponents` está desligado de propósito (telas por usuário).
- Versões exatas no `package.json`; preserve o lockfile. Nova dependência só com necessidade concreta, explicada na entrega.
- Leitura de dados só em `src/lib/data.ts` / Server Actions, sempre via `requireUser()` (sessão validada com `getUser()`).

## Dinheiro e datas
- Centavos `bigint` no banco; texto na API/JSON; `BigInt` no código (`src/lib/money.ts`). Nunca ponto flutuante para dinheiro.
- Datas financeiras são dias (`date`, `YYYY-MM-DD`) no calendário de Brasília (`src/lib/dates.ts`); timestamps com fuso.
- Parcelas e rateios fecham no total (`splitCents`). Sem dupla contagem: transferência própria, estorno, compra-mãe, pagamento de fatura, previsão de assinatura.
- Nunca mostrar zero onde faltam dados; cobertura e projeções explícitas.

## Isolamento por usuário
- RLS em toda tabela com dados do usuário; FK composta `(owner_id, id)`; `owner_id default auth.uid()`; permissões por coluna; sem DELETE (arquivamento).
- Só a chave publicável no app. `service_role`/secret, senhas e `.env.local` nunca no navegador, no Git, em logs ou nas respostas.

## Banco
- Toda mudança = migration nova em `supabase/migrations/AAAAMMDDHHMMSS_nome.sql`, posterior às existentes. Nunca editar migration aplicada, `db reset` remoto ou `migration repair` para esconder erro.
- `tests/db.test.ts` roda as migrations num Postgres local (PGlite); isso não substitui `npm run test:rls` no Supabase real.
- Nunca aplicar nada no Supabase remoto sem pedido expresso. `npm run check:supabase` (leitura anônima) é permitido.

## Toda entrega
- **Pedido fixo do dono:** ao fim de TODA modificação, por menor que seja, a resposta no chat traz (1) os comandos de commit e push prontos para copiar, um por bloco, com os arquivos exatos e a branch real, e (2) a seção "Supabase nesta entrega" com o que ele precisa fazer no painel/CLI, ou "Nada a fazer no Supabase".
- Não fazer commit nem push: o dono executa. Nunca `git add .`, force push ou reset destrutivo.
- Criar `docs/entregas/NN-descricao.md`: o que mudou, arquivos, como testar, verificações reais, comandos Git (PowerShell) concretos, mensagem de commit, PR/Vercel e bloco **"Supabase nesta entrega"** (ou "Sem alteração de banco; não há SQL para executar").
- Atualizar `TAREFAS.md` e `VERIFICACOES.md`. Não afirmar teste não executado.
- Procedimentos: `docs/SUPABASE.md` e `docs/GITHUB.md`.
