# Entrega 03 — Importação de CSV e Visão geral completa

Data: 17/10/2026 · Branch: `main`.

## 1. O que mudou

- **Importar extrato (Transações → Importar CSV):**
  - escolha a conta e o arquivo. O arquivo é lido no seu navegador (UTF-8 ou Latin-1, separador `;`, `,` ou tab);
  - colunas adivinhadas pelo cabeçalho (funciona com o CSV do Nubank) e ajustáveis; opção de inverter o sinal;
  - prévia linha a linha: **Nova**, **Possível duplicata** (já existe lançamento igual na conta), **Repetida no arquivo**, **Já importada** (mesmo ID do banco) e **Com erro**;
  - possíveis duplicatas começam **desmarcadas**: duas compras iguais podem ser legítimas, então você decide;
  - **tudo ou nada:** se algo falhar, nenhuma linha é gravada. O **mesmo arquivo** na mesma conta é recusado.
  - o período do arquivo marca esses dias como **cobertos por extrato**.
- **Visão geral:**
  - filtro de mês e de conta, compartilhado com Transações e Categorias;
  - cartões: saldo, resultado, despesas líquidas e comparação com **o mesmo intervalo do mês anterior** (dia 1 até o mesmo dia);
  - **Ritmo de gastos** com alternância **Acumulado/Diário**, linha do mês anterior e tabela com os valores;
  - **Média por dia com registro** (fórmula mostrada). **Média por dia corrido** e **projeção** só aparecem com cobertura total por extrato; senão o painel diz quantos dias estão cobertos;
  - **Mapa de calor:** gasto (quanto mais claro, maior), **sem gastos confirmados** (dia coberto por extrato), **sem cobertura** (hachurado: pode ter havido gasto) e dia futuro. Clicar num dia abre as transações daquele dia;
  - **Principais categorias** com participação; clicar abre as transações filtradas.
- **Categorias:** valores do mês em cada categoria e subcategoria (cada lançamento soma uma vez), participação, **rosca de despesas** e **receitas** em quadro separado. Clicar abre as transações.
- **Transações:** novo filtro por dia (vem do mapa de calor), com link "ver o mês inteiro".

**Nova dependência:** `recharts` 3.10.1, para os gráficos de ritmo e a rosca. Já estava prevista no projeto desde o início.

### Arquivos

Novos: `supabase/migrations/20261017180000_importacao_e_painel.sql`, `src/lib/csv-import.ts`, `src/lib/dashboard.ts`, `src/lib/chart-colors.ts`, `src/app/actions/import.ts`, `src/components/csv-importer.tsx`, `src/components/charts/pace-chart.tsx`, `src/components/charts/spending-heatmap.tsx`, `src/components/charts/category-donut.tsx`, `src/app/(app)/transacoes/importar/page.tsx`, `tests/csv-import.test.ts`, `tests/dashboard.test.ts`, `tests/import-and-dashboard.test.ts`, `docs/exemplos/extrato-exemplo.csv`, `docs/entregas/03-importacao-e-painel.md`.

Alterados: `package.json`, `package-lock.json`, `src/lib/data.ts`, `src/lib/transactions.ts`, `src/app/(app)/visao-geral/page.tsx`, `src/app/(app)/categorias/page.tsx`, `src/app/(app)/transacoes/page.tsx`, `scripts/check-supabase.mjs`, `tests/transactions-lib.test.ts`, `docs/PRODUTO.md`, `TAREFAS.md`, `VERIFICACOES.md`.

## 2. Como testar

**Antes, aplique a migration (seção 5).** Sem ela, Visão geral e Categorias mostram "Confira se a migration da Entrega 03 foi aplicada".

```powershell
npm install
npm run dev
```

O `npm install` baixa o Recharts. Abra http://127.0.0.1:3001 e entre com `wanrley`.

1. **Importar:** Transações → **Importar CSV** → escolha uma conta com saldo inicial em 01/10/2026 ou antes → arquivo `docs/exemplos/extrato-exemplo.csv` (dados fictícios).
   - Esperado: colunas Data, Descrição, Valor e ID já escolhidas; 6 linhas "Nova" (os dois cafés têm IDs diferentes, então não são duplicata); período 01/10/2026 a 07/10/2026.
   - Clique em **Importar 6 lançamento(s)** → mensagem de sucesso.
2. Importe **o mesmo arquivo** de novo → "Este arquivo já foi importado nesta conta".
3. Copie o arquivo e, na cópia, troque só o ID da última linha (`EX-006` → `EX-099`). Importe:
   - as 5 linhas com ID repetido aparecem como **Já importada** (bloqueadas);
   - a linha com ID novo aparece como **Possível duplicata**, desmarcada, porque já existe "Pix recebido" igual no mesmo dia. Deixe desmarcada e clique em **Registrar só a cobertura do período**.
4. **Visão geral**, mês outubro/2026, conta = a do extrato:
   - mapa de calor: dias 01 a 07 sem lançamento em cinza ("sem gastos confirmados"); 02 e 05 em azul; dias depois de 07 até hoje **hachurados** ("sem cobertura");
   - clique no dia 02 → Transações do dia 02/10 (mercado + 2 cafés);
   - Média por dia corrido: "Indisponível", explicando quantos dias estão cobertos, porque os dias depois de 07/10 não têm extrato.
5. Alterne **Acumulado/Diário** no ritmo e abra "Ver os valores em tabela".
6. Edite os lançamentos importados e dê categorias (ex.: Mercado → Alimentação › Supermercado). Em **Categorias**, a rosca mostra Alimentação, e "Sem categoria" diminui.
7. Com "Todas as contas" no filtro, os dias só contam como cobertos se **todas** as contas ativas tiverem extrato naqueles dias.
8. Celular (janela estreita): importação com rolagem na prévia; o painel empilha os cartões.

## 3. Verificações executadas

- `npm run lint` ✅ · `npm run typecheck` ✅ · `npm test` ✅ (9 arquivos, 47 testes) · `npm run build` ✅.
- Paleta dos gráficos aprovada pelo validador (contraste e daltonismo) no fundo do app.
- `npm run check:supabase`: as migrations 01 e 02 estão aplicadas; a 03 ainda não.
- **Não testado:** as telas novas no navegador logado (depende da migration e do seu login). Detalhes em `VERIFICACOES.md`.

## 4. GitHub passo a passo (PowerShell)

```powershell
cd C:\Users\Wanwan\Documents\FinanceOS
git status
git add package.json package-lock.json supabase/migrations/20261017180000_importacao_e_painel.sql
git add src/lib/csv-import.ts src/lib/dashboard.ts src/lib/chart-colors.ts src/lib/data.ts src/lib/transactions.ts
git add src/app/actions/import.ts src/components/csv-importer.tsx src/components/charts
git add "src/app/(app)/transacoes" "src/app/(app)/visao-geral/page.tsx" "src/app/(app)/categorias/page.tsx"
git add tests scripts/check-supabase.mjs docs TAREFAS.md VERIFICACOES.md
git diff --cached --stat
git commit -m "feat: importacao de CSV e visao geral com ritmo, calor e categorias"
git push
git log --oneline -3
```

Depois do último `git status`, não deve sobrar nada. No GitHub (https://github.com/Wanrleycmpl/FinanceOS) → **Commits**: "feat: importacao de CSV…" no topo.

## 5. Supabase nesta entrega

**SQL novo:** `supabase/migrations/20261017180000_importacao_e_painel.sql`.

- **O que faz:**
  - cria a tabela `import_batches` (lotes de importação, com hash do arquivo e período coberto) com RLS;
  - acrescenta `external_id` e `import_batch_id` em `transactions`, com ID externo único por conta;
  - atualiza a view `transactions_read`, acrescentando as duas colunas no final;
  - cria as funções `import_transactions` (lote tudo-ou-nada), `daily_spending` (gasto por dia e cobertura) e `category_totals` (totais por categoria).
- **Impacto em dados:** só adiciona. Lançamentos existentes ficam com as colunas novas vazias. Nada é apagado.
- **Ordem:** só este arquivo (as duas anteriores já estão aplicadas).

```powershell
npx supabase@2.121.0 migration list
npx supabase@2.121.0 db push --dry-run
```

Esperado no dry-run: **somente** `20261017180000_importacao_e_painel.sql`. Se aparecer outra coisa, pare e me mande a saída.

```powershell
npx supabase@2.121.0 db push
npm run check:supabase
```

Esperado: as três migrations "APLICADA".

Conferência opcional (SQL Editor, só leitura):

```sql
select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relname = 'import_batches'; -- true
select column_name from information_schema.columns where table_schema = 'public' and table_name = 'transactions_read' order by ordinal_position desc limit 2; -- import_batch_id, external_id
```

**Se falhar:** o arquivo roda numa transação, então nada dele fica gravado. Me mande a saída de `migration list` e o erro. A correção será uma migration nova; não apague tabelas.

**Auth, Storage, variáveis e Vercel:** nada novo.

## 6. Pendências e próxima entrega

- Você: aplicar a migration (seção 5), rodar o Git (seção 4) e testar a seção 2.
- Limitação conhecida: o CSV não detecta transferências entre suas contas nem estornos. Créditos entram como receita. Para um estorno, mande o crédito importado para a lixeira e use "Estornar" na compra.
- **Entrega 04 — Cartões e faturas:** cartões com limite total, comprometido e disponível; faturas abertas/fechadas/pagas/parciais/atrasadas; pagamento de fatura sem contar a compra duas vezes.
