# FinanceOS

Finanças pessoais para brasileiros, com valores exatos em reais. Next.js 16 + Supabase.

## Rodar no computador

Requer Node.js 22.12+ (testado com 24).

```powershell
npm ci
npm run dev
```

Abra http://127.0.0.1:3001. As telas internas precisam do Supabase configurado: veja [docs/SUPABASE.md](docs/SUPABASE.md).

## Verificações

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npm run check:supabase   # leitura anônima do projeto Supabase em .env.local
npm run test:rls         # isolamento real com dois usuários de teste
```

`npm test` roda as migrations num PostgreSQL local em memória (PGlite) e os testes de dinheiro/datas. Isso não substitui `npm run test:rls` no Supabase real.

## Documentos

- [docs/PRODUTO.md](docs/PRODUTO.md) — escopo, regras e roteiro de entregas
- [docs/SUPABASE.md](docs/SUPABASE.md) — criar projeto, aplicar migrations, Auth e testes
- [docs/GITHUB.md](docs/GITHUB.md) — commit, push e pull request
- [docs/PUBLICACAO.md](docs/PUBLICACAO.md) — publicar na Vercel, ordem banco → código, voltar versão, backup
- [docs/entregas/](docs/entregas/) — guia de cada entrega
- [TAREFAS.md](TAREFAS.md) e [VERIFICACOES.md](VERIFICACOES.md) — estado real

## Estrutura

`src/app` rotas e Server Actions · `src/components` interface · `src/lib` dinheiro, datas, catálogo, Supabase e acesso a dados · `supabase/migrations` SQL · `tests` testes · `scripts` verificações remotas.
