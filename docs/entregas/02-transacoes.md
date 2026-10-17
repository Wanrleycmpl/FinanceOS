# Entrega 02 — Transações

Data: 17/10/2026 · Branch: `main` (você escolheu continuar nela).

## 1. O que mudou

- **Tela Transações** com filtros na URL: mês (com setas ‹ ›), busca, conta, categoria (a principal inclui as subcategorias), tipo e situação. "Mostrar ocultos", "Ver lixeira", paginação de 20 em 20.
- **Indicadores que seguem os filtros:** quantidade na lista, receitas, despesas líquidas (despesas − estornos), resultado e pendentes. Sem dados aparece "—", não zero.
- **Lançamentos:** despesa, receita, **transferência entre suas contas** (uma linha só, não conta como receita nem despesa) e **movimentação financeira** (aporte, resgate, empréstimo: muda o saldo, fica fora do resultado).
- **Estorno / cashback:** botão "Estornar" na despesa. O estorno reduz a despesa, usa a mesma categoria, nunca passa do valor da compra e não vira receita.
- **Ocultar** tira só da lista. **Excluir dos relatórios** tira dos indicadores, mas o saldo continua. **Lixeira** tira de tudo e pode ser restaurada. Não existe exclusão definitiva.
- **Pendente × liquidado:** pendente fica fora do saldo e do resultado; lançamento liquidado não pode ter data futura.
- **Exportar CSV** do filtro atual, pronto para Excel (`;`, vírgula decimal, datas dd/mm/aaaa).
- **Visão geral:** seletor de mês, saldo consolidado real (saldo inicial + lançamentos liquidados), resultado do mês, despesas líquidas, saldos por conta e transações recentes com "Ver todas" no mesmo mês.
- **Contas:** mostra o saldo atual de cada conta. Mudar a data do saldo inicial para depois de lançamentos existentes é bloqueado, com mensagem clara.

### Arquivos

Novos: `supabase/migrations/20261017150000_transacoes.sql`, `src/lib/transactions.ts`, `src/lib/csv-export.ts`, `src/app/actions/transactions.ts`, `src/components/transaction-form.tsx`, `src/app/(app)/transacoes/exportar/route.ts`, `tests/helpers/pg.ts`, `tests/transactions.test.ts`, `tests/transactions-lib.test.ts`, `tests/csv-export.test.ts`, `docs/entregas/02-transacoes.md`.

Alterados: `src/app/(app)/transacoes/page.tsx`, `src/app/(app)/visao-geral/page.tsx`, `src/app/(app)/contas/page.tsx`, `src/app/actions/accounts.ts`, `src/lib/data.ts`, `src/lib/modules.ts`, `tests/db.test.ts`, `scripts/check-supabase.mjs`, `scripts/test-rls.mjs`, `docs/SUPABASE.md`, `docs/PRODUTO.md`, `TAREFAS.md`, `VERIFICACOES.md`.

Nenhuma dependência nova.

## 2. Como testar

Depende do Supabase com **as duas migrations** aplicadas (seção 5). Depois:

```powershell
npm run dev
```

Abra http://127.0.0.1:3001 e entre com `wanrley`.

1. Contas: tenha "Conta 1" com saldo inicial R$ 1.000,00 e "Conta 2" com R$ 0,00, as duas com data de hoje ou anterior.
2. Transações → **Novo lançamento** → Receita R$ 5.000,00, Renda › Salário, Conta 1 → Resultado **R$ 5.000,00**.
3. Despesa R$ 123,45, Alimentação › Supermercado, Conta 1 → Despesas líquidas **R$ 123,45**; Resultado **R$ 4.876,55**.
4. Transferência R$ 50,01 da Conta 1 para a Conta 2 → Resultado não muda. Em Contas: Conta 1 **R$ 5.826,54**, Conta 2 **R$ 50,01**. Consolidado na Visão geral: **R$ 5.876,55**.
5. Na despesa, **Estornar** R$ 200,00 → erro "passariam do valor da compra". Estornar R$ 23,45 → Despesas líquidas **R$ 100,00** ("R$ 123,45 − estornos R$ 23,45"); Receitas continuam R$ 5.000,00.
6. Mandar a despesa para a **Lixeira** → erro pedindo para tirar os estornos antes.
7. Uma despesa de R$ 7,00 → **Ocultar**: some da lista, mas os indicadores continuam com ela. "Mostrar ocultos" mostra a linha com o selo "Oculto". **Excluir dos relatórios**: sai dos indicadores, o saldo não muda.
8. Despesa com data futura e situação "Liquidado" → erro. Como "Pendente" → aparece em Pendentes e fica fora do saldo.
9. Filtro Categoria "Alimentação (inclui subcategorias)" → só lançamentos de alimentação; os indicadores acompanham. Busca "mercado" funciona.
10. **Exportar CSV** → abre no Excel com valores negativos para saídas.
11. Visão geral → mês anterior pelo seletor → "Sem dados" (não zero), se não houver lançamentos.
12. No celular (janela estreita), a lista vira cartões com os mesmos dados.

## 3. Verificações executadas

- `npm run lint` ✅ · `npm run typecheck` ✅ · `npm test` ✅ (6 arquivos, 30 testes) · `npm run build` ✅.
- Banco (PGlite, as duas migrations): receita/despesa e saldo exatos; transferência sem mudar o consolidado nem o resultado; estorno limitado, com categoria herdada e acompanhando troca de categoria; compra com estorno protegida; ocultar × excluir × lixeira; pendente fora do saldo; liquidado futuro recusado; conta arquivada, data antes do saldo inicial, categoria arquivada ou incompatível recusadas; tipo imutável; data do saldo inicial protegida; busca com `%` literal; isolamento A/B/anônimo.
- CSV: separador, aspas, sinal, centavos e proteção contra fórmulas.
- **Não testado:** as telas logadas no navegador e `npm run test:rls`, porque o Supabase ainda não tem as migrations.

## 4. GitHub passo a passo (PowerShell)

Os comandos da mensagem anterior ainda não foram rodados (o push da Entrega 01 não chegou ao GitHub). Rode tudo nesta ordem.

**A. Pendência da Entrega 01: juntar o README do GitHub e enviar**

```powershell
cd C:\Users\Wanwan\Documents\FinanceOS
git pull origin main --allow-unrelated-histories --no-rebase --no-edit -X ours
git push -u origin main
```

**B. Commit desta entrega.** Inclui também a regra no `CLAUDE.md` e a configuração do `supabase init`.

```powershell
git status
git add CLAUDE.md supabase/config.toml supabase/.gitignore supabase/migrations/20261017150000_transacoes.sql
git add src/lib/transactions.ts src/lib/csv-export.ts src/lib/data.ts src/lib/modules.ts
git add src/app/actions/transactions.ts src/app/actions/accounts.ts src/components/transaction-form.tsx
git add "src/app/(app)/transacoes" "src/app/(app)/visao-geral/page.tsx" "src/app/(app)/contas/page.tsx"
git add tests scripts docs TAREFAS.md VERIFICACOES.md
git diff --cached --stat
git commit -m "feat: transacoes com transferencia, estorno, lixeira e exportacao"
git push
git log --oneline -4
```

As aspas em `"src/app/(app)/..."` são necessárias por causa dos parênteses. Depois do `git status` final não deve sobrar nada além de arquivos ignorados.

No GitHub (https://github.com/Wanrleycmpl/FinanceOS), em **Commits** devem aparecer: a fundação, o "Merge…" e "feat: transacoes…". Sem pull request, porque você trabalha direto na `main`. **Vercel:** ainda não configurada.

## 5. Supabase nesta entrega

**SQL novo:** `supabase/migrations/20261017150000_transacoes.sql`.

- **O que faz:** cria a tabela `transactions` com RLS, as regras automáticas (estorno, conta, categoria, datas), a view `transactions_read` (dinheiro em texto) e as funções `transaction_summary` (indicadores) e `account_balances` (saldos). Também protege a data do saldo inicial das contas.
- **Ordem:** `20261017120000_fundacao.sql` **e depois** `20261017150000_transacoes.sql`. Como o seu Supabase ainda está vazio (conferido agora com `npm run check:supabase`), o `db push` aplica as duas, em ordem.
- **Impacto em dados:** só cria coisas novas; não altera nem apaga nada.

Comandos (detalhes em `docs/SUPABASE.md`, passos 3 a 5):

```powershell
npx supabase@2.121.0 login
npx supabase@2.121.0 link --project-ref SEU_PROJECT_REF
npx supabase@2.121.0 migration list
npx supabase@2.121.0 db push --dry-run
```

Esperado no dry-run: `20261017120000_fundacao.sql` e `20261017150000_transacoes.sql`, nessa ordem. Se aparecer outra coisa, pare e me mande a saída.

```powershell
npx supabase@2.121.0 db push
npx supabase@2.121.0 migration list
npm run check:supabase
```

Esperado: as duas versões nas colunas Local e Remote, e as duas "APLICADA".

Depois, no painel (passo 5 do guia, se ainda não fez):
1. Desligar **Allow new users to sign up**.
2. **Authentication → Users → Add user**: `wanrley@financeos.local`, sua senha, **Auto Confirm User** marcado.

Conferência opcional no SQL Editor (só leitura):

```sql
select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relname = 'transactions';  -- true
select tgname from pg_trigger where tgrelid = 'public.transactions'::regclass and not tgisinternal order by 1;
```

Esperado: `true` e os gatilhos `transactions_guard`, `transactions_sync_refunds` e `transactions_touch`.

Teste de isolamento (opcional, passo 6 do guia): `npm run test:rls` agora cobre também as transações.

**Se falhar:** cada arquivo roda numa transação; o que falhou não fica gravado. Me mande a saída de `migration list` e o erro. Nada de apagar tabelas ou `db reset`.

**Variáveis, Storage e Vercel:** nada novo.

## 6. Pendências e próxima entrega

- Você: rodar as seções 4 e 5. Depois me avise para eu conferir com `npm run check:supabase` e revisar as telas logadas com você.
- **Entrega 03:** importação CSV (prévia, mapeamento de colunas, conta de destino, sem duplicar na reimportação) e Visão geral completa (ritmo diário/acumulado, mapa de calor com dias sem cobertura, principais categorias, rosca de despesas).
