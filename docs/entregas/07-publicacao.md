# Entrega 07 — Publicação controlada

Data: 17/10/2026 · Branch: `main`.

## 1. O que mudou

- **Cabeçalhos de segurança** em todas as respostas:
  - o app não abre dentro de outro site (`X-Frame-Options: DENY`, `frame-ancestors 'none'`);
  - HTTPS obrigatório (HSTS);
  - `nosniff`, política de referência e bloqueio de câmera, microfone, localização e pagamentos do navegador;
  - sem o cabeçalho "powered by".
- **Fora dos buscadores:** `robots.txt` bloqueia tudo, e as páginas dizem `noindex`. Dados financeiros pessoais não aparecem no Google.
- **Cópia de segurança completa** (Configurações → Baixar cópia JSON): perfil, instituições, contas, categorias, cartões, parcelamentos, assinaturas, importações e lançamentos, com dinheiro exato em centavos. Só funciona logado.
- **Aviso de senha forte** em Configurações.
- **Guia de publicação** em `docs/PUBLICACAO.md`: Vercel passo a passo, variáveis, Auth, proteção dos previews, ordem banco → código, como voltar uma versão, limites dos planos gratuitos.
- `CLAUDE.md`: regra de produção registrada (todo push na `main` publica; migration antes do código).

Nenhuma dependência nova. Nenhuma mudança de banco nesta entrega.

### Arquivos

Novos: `src/app/robots.ts`, `src/app/(app)/configuracoes/backup/route.ts`, `docs/PUBLICACAO.md`, `docs/entregas/07-publicacao.md`.

Alterados: `next.config.ts`, `src/app/layout.tsx`, `src/proxy.ts` (deixa o `robots.txt` passar sem login), `src/app/(app)/configuracoes/page.tsx`, `CLAUDE.md`, `README.md`, `docs/PRODUTO.md`, `TAREFAS.md`, `VERIFICACOES.md`.

## 2. Ordem do que você faz agora

A Entrega 06 (assinaturas) ainda não foi aplicada nem commitada. Faça **nesta ordem**: banco primeiro, depois código. A partir da publicação, isso vira regra.

### Passo A — Banco da Entrega 06

```powershell
cd C:\Users\Wanwan\Documents\FinanceOS
npx supabase@2.121.0 db push --dry-run
```

Esperado: **somente** `20261017235000_assinaturas.sql`.

```powershell
npx supabase@2.121.0 db push
npm run check:supabase
```

Esperado: as seis migrations "APLICADA".

### Passo B — Commit da Entrega 06

```powershell
git add supabase/migrations/20261017235000_assinaturas.sql src/lib/subscriptions.ts src/app/actions/subscriptions.ts src/components/subscription-form.tsx
git add src/components/coming-soon.tsx src/lib/data.ts src/lib/modules.ts
git add "src/app/(app)/assinaturas/page.tsx" "src/app/(app)/transacoes/page.tsx" "src/app/(app)/visao-geral/page.tsx"
git add tests/subscriptions.test.ts tests/subscriptions-lib.test.ts scripts docs/entregas/06-assinaturas.md
git diff --cached --stat
git commit -m "feat: assinaturas pessoais com equivalente mensal e registro de cobranca"
```

### Passo C — Commit da Entrega 07 e push

```powershell
git add next.config.ts src/app/robots.ts src/app/layout.tsx src/proxy.ts
git add "src/app/(app)/configuracoes"
git add CLAUDE.md README.md TAREFAS.md VERIFICACOES.md docs
git status
git commit -m "feat: protecoes para producao, backup em JSON e guia de publicacao"
git push
git log --oneline -3
```

Depois do `git status` do passo C não deve sobrar arquivo modificado. O `git push` envia os dois commits juntos.

### Passo D — Teste rápido no seu computador

```powershell
npm run dev
```

Em http://127.0.0.1:3001:
1. Entre.
2. Em Configurações, troque para uma **senha forte**.
3. Saia e entre com a senha nova.
4. Em Configurações, clique em **Baixar cópia (JSON)**: o arquivo baixa e tem suas contas e lançamentos.
5. Confira Assinaturas, conforme o guia 06.

### Passo E — Publicar

Siga `docs/PUBLICACAO.md` do início ao fim: Vercel, as duas variáveis, Deploy, Site URL no Supabase e proteção dos previews.

## 3. Verificações executadas

- `npm run lint` ✅ · `npm run typecheck` ✅ · `npm test` ✅ (74) · `npm run build` ✅.
- Produção local (`npm start`):
  - cabeçalhos de segurança presentes e X-Powered-By ausente;
  - `/robots.txt` com `Disallow: /`;
  - `/visao-geral`, `/configuracoes/backup` e `/transacoes/exportar` sem login → `/entrar`.
- Navegador (produção local): login com usuário inexistente mostrou "Usuário ou senha incorretos." e nenhum erro no console. As proteções não atrapalham o formulário.
- **Não testado:** a publicação na Vercel (feita por você), o backup com dados reais (exige o seu login) e a migration de assinaturas (passo A).

## 4. GitHub

Ver passos B e C acima. No GitHub (https://github.com/Wanrleycmpl/FinanceOS) → **Commits**: "feat: protecoes para producao…" no topo e "feat: assinaturas pessoais…" logo abaixo.

**Vercel:** depois do passo E, cada push na `main` gera um deploy de produção. Em Vercel → Deployments você vê cada versão, com o commit correspondente.

## 5. Supabase nesta entrega

**Sem alteração de banco na Entrega 07; não há SQL novo.** Pendências no Supabase:
1. Aplicar a migration da **Entrega 06** (passo A).
2. Conferir que **Allow new users to sign up** está desligado.
3. Depois do deploy, em Authentication → URL Configuration:
   - **Site URL** = endereço da Vercel;
   - nas **Redirect URLs**, adicionar `https://SEU-ENDERECO.vercel.app/**`.

Na Vercel, as variáveis são só `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

## 6. Pendências e próximos passos

- Você: passos A a E.
- Depois de publicado, se algo não abrir, me mande o print e o endereço (sem senhas). Em Vercel → Deployments → (o deploy) → **Logs** aparecem os erros do servidor.
- Próximas frentes, conforme o plano original:
  - restauração a partir da cópia JSON;
  - categorizar lançamentos importados mais rápido (regras por descrição);
  - e, só depois, avaliar SaaS (cobrança, termos/LGPD, projeto de teste separado), assistente de IA e Open Finance.
