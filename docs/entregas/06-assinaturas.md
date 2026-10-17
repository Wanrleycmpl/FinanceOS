# Entrega 06 — Assinaturas pessoais

Data: 17/10/2026 · Branch: `main`.

## 1. O que mudou

- **Assinaturas** (streaming, apps, academia, nuvem…): serviço, valor de cada cobrança, periodicidade (semanal, mensal, trimestral, semestral, anual), conta ou cartão, categoria, próxima cobrança e status (ativa, pausada, cancelada).
- **Total mensal equivalente** com a conta explicada: custo por ano ÷ 12. R$ 120,00 por ano = **R$ 10,00/mês**. Quando não fecha em centavos, aparece "≈". O custo por ano aparece exato.
- **Previsão não é despesa:** cadastrar uma assinatura não cria lançamento. "Registrar cobrança" (data até hoje e valor, que pode ter reajuste) cria **um** lançamento na conta ou no cartão da assinatura, com a categoria dela, e avança a próxima cobrança. Tudo numa só operação.
- **Dia da cobrança mantido:** assinatura do dia 31 cai em 28/02 e volta para 31/03.
- Se a data prevista passou sem cobrança registrada, a assinatura avisa: "a data passou… registre ou ajuste".
- **Visão geral:** quadro "Assinaturas: próximas cobranças" (próximos 30 dias e atrasadas), com o total mensal equivalente.
- **Transações:** lançamentos de assinatura têm o selo "Assinatura".
- A assinatura do próprio FinanceOS (SaaS) **não** é isto: virá em entrega própria.
- Todas as áreas do menu agora funcionam (o aviso "em breve" foi removido).

Nenhuma dependência nova.

### Arquivos

Novos: `supabase/migrations/20261017235000_assinaturas.sql`, `src/lib/subscriptions.ts`, `src/app/actions/subscriptions.ts`, `src/components/subscription-form.tsx`, `tests/subscriptions.test.ts`, `tests/subscriptions-lib.test.ts`, `docs/entregas/06-assinaturas.md`.

Alterados: `src/app/(app)/assinaturas/page.tsx`, `src/app/(app)/transacoes/page.tsx`, `src/app/(app)/visao-geral/page.tsx`, `src/lib/data.ts`, `src/lib/modules.ts`, `scripts/check-supabase.mjs`, `scripts/test-rls.mjs`, `docs/PRODUTO.md`, `TAREFAS.md`, `VERIFICACOES.md`.

Removido: `src/components/coming-soon.tsx` (não é mais usado).

## 2. Como testar

**Antes, aplique a migration (seção 5).** Depois: `npm run dev` → http://127.0.0.1:3001 → entre com `wanrley`.

1. **Assinaturas → Nova assinatura:** "Nuvem anual", `120,00`, Anual, próxima cobrança daqui a 10 dias, um cartão.
   - A prévia diz "Equivale a R$ 10,00 por mês (R$ 120,00 por ano ÷ 12)".
   - Depois de salvar, em Transações **não** aparece nenhuma despesa nova.
2. Outra: "Streaming", `39,90`, Mensal, próxima cobrança **hoje**, uma conta.
   - Total mensal equivalente = R$ 49,90; custo por ano = R$ 598,80.
3. Na Streaming, **Registrar cobrança** com data de hoje e R$ 39,90.
   - Aparece a mensagem de sucesso; a próxima cobrança vai para o mesmo dia do mês que vem;
   - em Transações há **uma** despesa "Streaming" com selo "Assinatura";
   - a conta perdeu R$ 39,90.
4. Tente registrar com data futura → mensagem explicando que precisa ter acontecido.
5. **Pausar** → some das próximas cobranças da Visão geral e não aceita cobrança. **Retomar** → volta.
6. **Editar** a próxima cobrança para o dia 31 de um mês → depois de registrar, a seguinte cai no último dia do mês curto.
7. Visão geral: o quadro "Assinaturas: próximas cobranças" lista as previsões dos próximos 30 dias.

## 3. Verificações executadas

- `npm run lint` ✅ · `npm run typecheck` ✅ · `npm test` ✅ (15 arquivos, 74 testes) · `npm run build` ✅.
- `npm run check:supabase`: 01–05 aplicadas; 06 ainda não.
- **Não testado:** telas no navegador logado. Detalhes em `VERIFICACOES.md`.

## 4. GitHub passo a passo (PowerShell)

```powershell
cd C:\Users\Wanwan\Documents\FinanceOS
git status
git add supabase/migrations/20261017235000_assinaturas.sql src/lib/subscriptions.ts src/app/actions/subscriptions.ts src/components/subscription-form.tsx
git add src/components/coming-soon.tsx src/lib/data.ts src/lib/modules.ts
git add "src/app/(app)/assinaturas/page.tsx" "src/app/(app)/transacoes/page.tsx" "src/app/(app)/visao-geral/page.tsx"
git add tests scripts docs TAREFAS.md VERIFICACOES.md
git diff --cached --stat
git commit -m "feat: assinaturas pessoais com equivalente mensal e registro de cobranca"
git push
git log --oneline -3
```

O `git add src/components/coming-soon.tsx` registra a **remoção** do arquivo (ele foi apagado de propósito).

## 5. Supabase nesta entrega

**SQL novo:** `supabase/migrations/20261017235000_assinaturas.sql`.

- **O que faz:**
  - cria a tabela `personal_subscriptions` (com RLS);
  - acrescenta `subscription_id` em `transactions`, para o histórico de cobranças;
  - atualiza a view `transactions_read`;
  - cria `subscription_next` (próxima data mantendo o dia) e `register_subscription_charge` (cria a despesa e avança a data numa só transação).
- **Impacto em dados:** só adiciona; nada existente muda.
- **Ordem:** só este arquivo.

```powershell
npx supabase@2.121.0 db push --dry-run
```

Esperado: **somente** `20261017235000_assinaturas.sql`.

```powershell
npx supabase@2.121.0 db push
npm run check:supabase
```

Esperado: as seis migrations "APLICADA".

Conferência opcional (SQL Editor, só leitura):

```sql
select relrowsecurity from pg_class where oid = 'public.personal_subscriptions'::regclass;  -- true
select public.subscription_next('2026-01-31', 'monthly', 31);  -- 2026-02-28
```

**Se falhar:** nada do arquivo fica gravado. Me mande a saída de `migration list` e o erro.

**Auth, Storage, variáveis e Vercel:** nada novo.

## 6. Pendências e próxima entrega

- Você: seções 5, 4 e 2.
- Limitação conhecida: o app não cria cobranças sozinho. A previsão aparece, e a despesa só nasce quando você registra, de propósito, para não inventar gasto.
- **Entrega 07 — Publicação controlada:** colocar o FinanceOS na internet pela Vercel com segurança. Inclui projeto Supabase de produção separado (ou decisão de usar o atual), variáveis, URL de Auth, senha forte, backup e uma revisão de segurança antes de publicar.
