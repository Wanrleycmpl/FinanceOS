# Entrega 05 — Parcelamentos

Data: 17/10/2026 · Branch: `main`.

## 1. O que mudou

- **Novo parcelamento** (tela Parcelamentos): o que foi comprado, valor total, número de parcelas (2 a 72), data da 1ª parcela, conta ou cartão e categoria. Uma **prévia** mostra a divisão exata antes de criar.
- **Centavos exatos:** o resto vai para as primeiras parcelas. R$ 100,00 em 3 = **R$ 33,34 + R$ 33,33 + R$ 33,33**, e a soma sempre fecha no total.
- **Sem compra-mãe:** só as parcelas existem como lançamentos, cada uma no seu mês, então o gasto nunca é contado duas vezes.
- **Na conta (carnê, boleto, débito):** cada parcela fica **pendente até você confirmar o pagamento**. Data passada não prova pagamento: aparece como "Vencida: confirme se pagou". Ao confirmar, o saldo da conta muda. Dá para desfazer. Ao criar, você pode informar quantas parcelas já pagou (só as com data até hoje).
- **No cartão:** cada parcela entra na **fatura do seu mês** e todas **comprometem o limite** desde já. A parcela aparece como "Na fatura" e fica "Paga" quando a fatura dela é paga em Cartões.
- **Cronograma** com número, data, fatura (no cartão), valor e situação: paga, vencida a confirmar, a pagar, na fatura, futura ou cancelada. Também mostra pagas/total, restante e barra de progresso.
- **Cancelar:**
  - "Cancelar parcelas restantes": as não cobradas/pagas vão para a lixeira;
  - "Cancelar e estornar": também cria um estorno para cada parcela já cobrada/paga, no mesmo meio. Cada uma é estornada uma única vez, e o limite do cartão é liberado.
- **Proteção:** em Transações, uma parcela só pode ter descrição, data e categoria editadas. Valor, meio e lixeira ficam com o parcelamento (o total sempre fecha). A linha da parcela tem um atalho "Parcelamento".

Nenhuma dependência nova.

### Arquivos

Novos: `supabase/migrations/20261017230000_parcelamentos.sql`, `src/lib/installments.ts`, `src/app/actions/installments.ts`, `src/components/installment-form.tsx`, `tests/installments.test.ts`, `tests/installments-lib.test.ts`, `docs/entregas/05-parcelamentos.md`.

Alterados: `src/app/(app)/parcelamentos/page.tsx`, `src/app/(app)/transacoes/page.tsx`, `src/components/transaction-form.tsx`, `src/lib/data.ts`, `src/lib/modules.ts`, `src/lib/transactions.ts`, `scripts/check-supabase.mjs`, `scripts/test-rls.mjs`, `docs/PRODUTO.md`, `TAREFAS.md`, `VERIFICACOES.md`.

## 2. Como testar

**Antes, aplique a migration (seção 5).** Depois: `npm run dev` → http://127.0.0.1:3001 → entre com `wanrley`.

1. **Parcelamentos → Novo parcelamento:** "Teste centavos", total `100,00`, 3 parcelas, 1ª em 31/01/2026, uma conta com saldo inicial em janeiro/2026 ou antes. Se a conta começar depois, a mensagem avisa: use uma data posterior.
   - Prévia: "1ª parcela R$ 33,34 · demais R$ 33,33 · soma exata R$ 100,00".
   - Cronograma: 31/01, 28/02, 31/03, as três "Vencida: confirme se pagou". O saldo da conta não muda.
2. **Confirmar pagamento** na 1ª → saldo cai R$ 33,34; progresso 1/3. **Desfazer** → volta.
3. Novo parcelamento no **cartão**: "TV", `1.200,00`, 12×, 1ª no dia 05 deste mês.
   - Em Cartões, o comprometido sobe **R$ 1.200,00** de uma vez; cada mês tem sua fatura com R$ 100,00.
   - Em Transações (deste mês), só a parcela 1/12 aparece nas despesas.
4. Em Transações, **Editar** uma parcela e tentar mudar o valor → mensagem "controlados em Parcelamentos". A linha não tem botão Lixeira.
5. **Cancelar e estornar** a TV → as parcelas futuras ficam "Cancelada"; a 1/12 (já cobrada) ganha um estorno de R$ 100,00; o comprometido do cartão volta ao que era antes.
6. Parcelamento de R$ 10,00 em 3 → R$ 3,34 + R$ 3,33 + R$ 3,33.

## 3. Verificações executadas

- `npm run lint` ✅ · `npm run typecheck` ✅ · `npm test` ✅ (13 arquivos, 67 testes) · `npm run build` ✅.
- `npm run check:supabase`: 01–04 aplicadas; 05 ainda não.
- **Não testado:** telas no navegador logado. Detalhes em `VERIFICACOES.md`.

## 4. GitHub passo a passo (PowerShell)

```powershell
cd C:\Users\Wanwan\Documents\FinanceOS
git status
git add supabase/migrations/20261017230000_parcelamentos.sql src/lib/installments.ts src/app/actions/installments.ts src/components/installment-form.tsx
git add src/lib/data.ts src/lib/modules.ts src/lib/transactions.ts src/components/transaction-form.tsx
git add "src/app/(app)/parcelamentos/page.tsx" "src/app/(app)/transacoes/page.tsx"
git add tests scripts docs TAREFAS.md VERIFICACOES.md
git diff --cached --stat
git commit -m "feat: parcelamentos com centavos exatos, confirmacao e cancelamento"
git push
git log --oneline -3
```

## 5. Supabase nesta entrega

**SQL novo:** `supabase/migrations/20261017230000_parcelamentos.sql`.

- **O que faz:**
  - cria a tabela `installment_plans` (com RLS; só leitura pelo app);
  - acrescenta `plan_id` e `installment_number` em `transactions` (o app não pode gravar direto);
  - atualiza `transactions_read` e `guard_transaction` (protege valor, meio e lixeira das parcelas; parcela de cartão pode nascer liquidada);
  - cria `create_installment_plan` (plano + parcelas numa transação) e `cancel_installment_plan` (cancelar com ou sem estorno).
- **Impacto em dados:** só adiciona. Lançamentos existentes ficam sem plano e continuam iguais.
- **Ordem:** só este arquivo.

```powershell
npx supabase@2.121.0 db push --dry-run
```

Esperado: **somente** `20261017230000_parcelamentos.sql`.

```powershell
npx supabase@2.121.0 db push
npm run check:supabase
```

Esperado: as cinco migrations "APLICADA".

Conferência opcional (SQL Editor, só leitura):

```sql
select relrowsecurity from pg_class where oid = 'public.installment_plans'::regclass;  -- true
select proname, prosecdef from pg_proc where proname in ('create_installment_plan', 'cancel_installment_plan');  -- ambas true
```

**Se falhar:** nada do arquivo fica gravado. Me mande a saída de `migration list` e o erro.

**Auth, Storage, variáveis e Vercel:** nada novo.

## 6. Pendências e próxima entrega

- Você: seções 5, 4 e 2.
- Limitações conhecidas:
  - não dá para mudar o número de parcelas de um plano existente (cancele e crie outro);
  - parcela paga adiantada na conta: ajuste a data dela em Transações antes de confirmar.
- **Entrega 06 — Assinaturas pessoais:** serviço, valor, periodicidade, conta ou cartão, categoria, próxima cobrança e status; total mensal equivalente explicado (R$ 120,00/ano = R$ 10,00/mês); previsão de cobrança sem virar uma segunda despesa; próximos vencimentos na Visão geral.
