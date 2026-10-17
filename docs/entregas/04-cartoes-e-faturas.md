# Entrega 04 — Cartões e faturas

Data: 17/10/2026 · Branch: `main`.

## 1. O que mudou

- **Cartões:** cadastro com banco, nome, últimos 4 dígitos (opcional), limite, dia de fechamento e dia de vencimento; editar, arquivar e restaurar.
- **Limite:** total, **comprometido** (compras − estornos − pagamentos já feitos, incluindo lançamentos futuros como parcelas) e **disponível**. Limite não entra no saldo das contas.
- **Compra no cartão:** em Transações, Despesa → "Pago com" → cartão.
  - Conta como gasto na data da compra (resultado, categorias, ritmo), mas **não mexe no saldo** de nenhuma conta.
  - Vai para a fatura certa: compra no dia do fechamento ou depois cai na fatura seguinte. Dá para mover de fatura manualmente.
- **Faturas** (tela Cartões): mês, fechamento, vencimento, total, pago e situação: **aberta, fechada, paga, paga parcialmente, atrasada, atrasada (parcial) ou com crédito**.
  - No detalhe aparecem compras, **encargos** (lançamentos em Finanças › Tarifas, Juros e encargos ou Multas), estornos e pagamentos.
  - Toda fatura aparece como **estimada**, porque é calculada pelos seus lançamentos, não lida do banco.
- **Pagamento de fatura:** botão "Pagar fatura" (já preenche o valor que falta) ou tipo "Pagamento de fatura de cartão". Sai da conta e reduz a dívida do cartão; **não é uma nova despesa**, porque as compras já foram contadas.
- **Estorno de compra no cartão:** volta como crédito no mesmo cartão.
- **Transações:** filtro "Conta" agora inclui cartões; a lista mostra "Cartão · fatura mm/aaaa" e "Conta → Cartão" nos pagamentos. A exportação CSV também.
- **Visão geral:** quadro de cartões com limite, comprometido, disponível e próximos vencimentos (faturas fechadas a pagar).

Nenhuma dependência nova.

### Arquivos

Novos: `supabase/migrations/20261017210000_cartoes.sql`, `src/lib/cards.ts`, `src/app/actions/cards.ts`, `tests/cards.test.ts`, `tests/cards-lib.test.ts`, `docs/entregas/04-cartoes-e-faturas.md`.

Alterados: `src/app/(app)/cartoes/page.tsx`, `src/app/(app)/transacoes/page.tsx`, `src/app/(app)/transacoes/exportar/route.ts`, `src/app/(app)/visao-geral/page.tsx`, `src/app/actions/transactions.ts`, `src/components/forms.tsx`, `src/components/transaction-form.tsx`, `src/lib/csv-export.ts`, `src/lib/data.ts`, `src/lib/modules.ts`, `src/lib/transactions.ts`, `scripts/check-supabase.mjs`, `scripts/test-rls.mjs`, `docs/PRODUTO.md`, `TAREFAS.md`, `VERIFICACOES.md`.

## 2. Como testar

**Antes, aplique a migration (seção 5).** Depois: `npm run dev` → http://127.0.0.1:3001 → entre com `wanrley`.

1. **Cartões → Novo cartão:** banco "Banco Teste", nome "Cartão Teste", limite `5.000,00`, fechamento `10`, vencimento `20`.
   Esperado: limite R$ 5.000,00; comprometido R$ 0,00; disponível R$ 5.000,00.
2. **Transações → Novo lançamento:** Despesa R$ 200,00, data dia 05 deste mês, "Pago com" → Cartão Teste.
   Esperado:
   - em Contas, nenhum saldo muda;
   - em Transações, Despesas líquidas sobem R$ 200,00;
   - em Cartões, comprometido R$ 200,00, disponível R$ 4.800,00, e a fatura do mês aparece.
3. Outra despesa no cartão com data **no dia 10 ou depois** → vai para a fatura do **mês seguinte**.
4. Em Transações, **Estornar** a compra de R$ 200,00 em R$ 50,00 → o estorno usa o mesmo cartão; comprometido cai para R$ 150,00, mais a compra do item 3.
5. Despesa futura (ex.: dia 05 do mês que vem) como **Pendente** no cartão → comprometido aumenta, mesmo sem ser hoje.
6. **Cartões → fatura fechada → Pagar fatura** (o valor já vem preenchido) → escolha a conta → Registrar.
   Esperado:
   - a conta perde esse valor;
   - Despesas do mês **não mudam**;
   - a fatura fica **Paga** (ou **Paga parcialmente**, se você mudar o valor para menos).
   - Obs.: fatura ainda **aberta** (antes do fechamento) não mostra o botão; para pagar antecipado, use o tipo "Pagamento de fatura de cartão" em Transações.
7. Fatura vencida sem pagamento → **Atrasada**, também na Visão geral em "Próximos vencimentos".
8. Despesa no cartão com categoria Finanças › Juros e encargos → aparece em **Encargos** no detalhe da fatura.
9. Arquive o cartão → ele não aparece mais em "Pago com", mas a fatura ainda pode ser paga.

## 3. Verificações executadas

- `npm run lint` ✅ · `npm run typecheck` ✅ · `npm test` ✅ (11 arquivos, 58 testes) · `npm run build` ✅.
- `npm run check:supabase`: 01, 02 e 03 aplicadas; 04 ainda não.
- **Não testado:** telas no navegador logado (depende da migration). Detalhes em `VERIFICACOES.md`.

## 4. GitHub passo a passo (PowerShell)

```powershell
cd C:\Users\Wanwan\Documents\FinanceOS
git status
git add supabase/migrations/20261017210000_cartoes.sql src/lib/cards.ts src/app/actions/cards.ts
git add src/lib/data.ts src/lib/modules.ts src/lib/transactions.ts src/lib/csv-export.ts
git add src/app/actions/transactions.ts src/components/forms.tsx src/components/transaction-form.tsx
git add "src/app/(app)/cartoes/page.tsx" "src/app/(app)/transacoes" "src/app/(app)/visao-geral/page.tsx"
git add tests scripts docs TAREFAS.md VERIFICACOES.md
git diff --cached --stat
git commit -m "feat: cartoes de credito, faturas e pagamento de fatura"
git push
git log --oneline -3
```

No GitHub → **Commits**: "feat: cartoes de credito…" no topo.

## 5. Supabase nesta entrega

**SQL novo:** `supabase/migrations/20261017210000_cartoes.sql`.

- **O que faz:**
  - cria a tabela `credit_cards` (com RLS) e as funções `save_card`, `statement_for` (fatura pela data), `card_overview` (limite) e `card_statements` (faturas);
  - em `transactions`: a conta passa a ser opcional (compra no cartão não tem conta) e entram as colunas `card_id` e `statement_month`, com o tipo novo `card_payment`;
  - troca as regras de tipo/sentido por versões que conhecem o cartão (todas as regras antigas continuam valendo);
  - atualiza `guard_transaction`, `transactions_read`, `transaction_summary`, `daily_spending` e `category_totals` para reconhecer cartões.
- **Impacto em dados:** os lançamentos existentes já têm conta e continuam válidos; nada é apagado nem alterado.
- **Ordem:** só este arquivo.

```powershell
npx supabase@2.121.0 db push --dry-run
```

Esperado: **somente** `20261017210000_cartoes.sql`. Se aparecer outra coisa, pare e me mande a saída.

```powershell
npx supabase@2.121.0 db push
npm run check:supabase
```

Esperado: as quatro migrations "APLICADA".

Conferência opcional (SQL Editor, só leitura):

```sql
select relrowsecurity from pg_class where oid = 'public.credit_cards'::regclass;  -- true
select conname from pg_constraint where conrelid = 'public.transactions'::regclass and conname like 'transactions_%check' order by 1;
```

Esperado na segunda consulta, entre outras: `transactions_means_check`, `transactions_nature_check`, `transactions_nature_direction_check`.

**Se falhar:** o arquivo roda numa transação, então nada dele fica gravado. Me mande a saída de `migration list` e o erro.

**Auth, Storage, variáveis e Vercel:** nada novo.

## 6. Pendências e próxima entrega

- Você: seções 5, 4 e 2.
- Limitações conhecidas:
  - mudar o dia de fechamento de um cartão não move compras já lançadas;
  - o pagamento antecipado de fatura ainda aberta é feito pelo tipo "Pagamento de fatura" em Transações;
  - não há confirmação do valor oficial da fatura do banco (todas são estimadas).
- **Entrega 05 — Parcelamentos:** compra parcelada (em conta ou cartão) com cronograma, parcelas pagas/pendentes, valor restante e progresso. Centavos distribuídos exatamente (R$ 100,00 em 3 = R$ 33,34 + R$ 33,33 + R$ 33,33). Cancelamento e estorno sem contar duas vezes.
