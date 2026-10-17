# Publicação — FinanceOS na internet (Vercel + Supabase)

Quem publica é você. Este guia explica cada clique. O código já está preparado: cabeçalhos de segurança, bloqueio de buscadores, login único e cópia de segurança.

## Decisão: qual Supabase é a "produção"

O FinanceOS é, por enquanto, um app pessoal com um único login. **O projeto Supabase que você já usa passa a ser a produção.** É nele que estão seus dados reais.

- Mudanças de banco continuam sendo testadas primeiro no PostgreSQL local dos testes (`npm test`) e só depois aplicadas com `db push`.
- Quando o FinanceOS virar SaaS com outros usuários, criaremos um segundo projeto Supabase só para teste, e os previews da Vercel apontarão para ele.

## Antes de publicar (uma vez)

1. **Senha forte:** abra o app → Configurações → Trocar senha. Use 12+ caracteres ou uma frase que você não usa em outro lugar. A tela de entrada ficará na internet.
2. **Cópia de segurança:** Configurações → **Baixar cópia (JSON)**. Guarde o arquivo.
3. **Cadastro bloqueado:** no Supabase, Authentication → Sign In / Providers → **Allow new users to sign up** deve estar **desligado**.
4. **Migrations em dia:** `npm run check:supabase` deve mostrar todas "APLICADA".

## Publicar na Vercel

1. Acesse https://vercel.com/signup e escolha **Continue with GitHub** (conta `Wanrleycmpl`).
2. **Add New… → Project**. Se a Vercel pedir acesso ao GitHub, permita **só o repositório `FinanceOS`**.
3. Em **Import Git Repository**, clique em **Import** ao lado de `Wanrleycmpl/FinanceOS`.
4. Na tela de configuração:
   - **Framework Preset:** Next.js (detectado sozinho).
   - **Root Directory:** `./` (não mude).
   - **Build and Output Settings:** deixe o padrão.
   - **Environment Variables:** adicione as duas abaixo, copiando os valores do seu `.env.local` (abra com o Bloco de Notas; não cole no chat):

     | Nome | Valor |
     |---|---|
     | `NEXT_PUBLIC_SUPABASE_URL` | o mesmo do `.env.local` |
     | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | o mesmo do `.env.local` (chave `sb_publishable_...`) |

     **Não** adicione `RLS_TEST_USER_*` nem nenhuma chave `secret`/`service_role`.
5. Clique em **Deploy** e espere 1 a 3 minutos. No fim aparece o endereço, algo como `https://financeos-xxxx.vercel.app`.
6. Abra o endereço → deve ir para **Entrar** → entre com `wanrley` e a sua senha.

## Depois do primeiro deploy

1. **Supabase → Authentication → URL Configuration:**
   - **Site URL** = o endereço da Vercel (ex.: `https://financeos-xxxx.vercel.app`);
   - em **Redirect URLs**, mantenha `http://127.0.0.1:3001/**` e adicione `https://financeos-xxxx.vercel.app/**`.
   O app não envia e-mails hoje, mas isso evita links quebrados no futuro.
2. **Vercel → Settings → Deployment Protection:** confirme que **Vercel Authentication** está ligada para **Preview**. Os endereços de teste de cada versão ficam só para você; a produção é protegida pelo login do app.
3. **Conferir as proteções** (PowerShell, troque pelo seu endereço):
   ```powershell
   curl.exe -sI https://financeos-xxxx.vercel.app/entrar
   ```
   Devem aparecer, entre outras: `x-frame-options: DENY`, `strict-transport-security`, `x-robots-tag: noindex, nofollow`.
4. **Celular:** abra o endereço no celular e entre. O menu fica no botão do topo.

## Como funciona daqui para frente

- **Todo `git push` na `main` publica em produção** em 1 a 3 minutos.
- **Ordem obrigatória quando houver migration:** primeiro `db push` (banco), depois `git push` (código). Código novo apontando para um banco antigo quebra telas.
- **Voltar uma versão do app:** Vercel → Deployments → escolha a versão anterior que funcionava → **⋯ → Promote to Production** (ou Instant Rollback). Isso **não** desfaz mudanças no banco; correção de banco é sempre uma migration nova.
- **Cópia de segurança:** baixe uma vez por mês (Configurações). O plano gratuito do Supabase não oferece backups para baixar; o plano Pro faz backup diário automático.

## Custos e limites (planos gratuitos)

- **Vercel Hobby:** gratuito para uso **pessoal e não comercial**. Quando o FinanceOS for vendido como SaaS, será preciso o plano Pro.
- **Supabase Free:** o projeto **pausa depois de 7 dias sem uso**. Se o app parar de carregar, entre no painel do Supabase e clique em **Restore project**. Os dados não se perdem.
- Antes de cobrar de outras pessoas: termos de uso, política de privacidade (LGPD), plano pago e projeto de teste separado. Isso fica para a etapa de SaaS.
