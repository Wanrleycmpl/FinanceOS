# Tarefas

Atualizado em 17/10/2026. Projeto recomeçado do zero em `Documents\FinanceOS` (a pasta antiga não é usada).

## Entrega 01 — Fundação
- [x] Next.js 16.4.2 + TypeScript + Tailwind 4, versões exatas, lockfile.
- [x] Supabase SSR: sessão em cookie, `proxy.ts`, `requireUser()` com `getUser()`.
- [x] Login único (app pessoal): usuário → e-mail interno, sem cadastro público nem recuperação por e-mail; trocar senha e sair em Configurações.
- [x] Menu lateral (computador) e recolhível (celular); áreas futuras sem dados simulados.
- [x] Contas manuais por instituição: criar, editar, arquivar, restaurar; saldo inicial em centavos exatos.
- [x] Catálogo 15/141 copiado uma vez por usuário; criar, renomear, arquivar categorias.
- [x] Perfil (nome), troca de senha.
- [x] Migration `20261017120000_fundacao.sql` com RLS, FK composta, permissões por coluna, sem DELETE.
- [x] Testes: dinheiro/datas/parcelas e migration em PGlite (isolamento A/B, anônimo).
- [ ] **Você:** criar o Supabase, `.env.local`, aplicar a migration, desligar cadastro e criar o usuário `wanrley` (`docs/SUPABASE.md`).
- [ ] **Você:** criar repositório no GitHub e fazer o primeiro push (`docs/entregas/01-fundacao.md`).
- [ ] Rodar `npm run test:rls` e o roteiro de interface no Supabase real; corrigir o que aparecer.
- [ ] Commitar `supabase/config.toml` gerado pelo `init`.

## Entrega 02 — Transações
- [x] Migration `20261017150000_transacoes.sql`: tabela, regras automáticas, RLS, indicadores e saldos.
- [x] Receita, despesa, transferência própria (uma linha), movimentação financeira, estorno limitado.
- [x] Filtros na URL, indicadores que seguem os filtros, paginação, ocultar × excluir × lixeira.
- [x] Exportar CSV; saldos reais em Contas e Visão geral; seletor de mês na Visão geral.
- [x] Testes no banco local (PGlite) e de filtros/CSV.
- [x] Migrations 20261017120000 e 20261017150000 aplicadas no Supabase; código no GitHub (commit 6bc35df).
- [ ] Conferir as telas logadas no navegador e `npm run test:rls` no Supabase real.

## Entrega 03 — Importação CSV e Visão geral completa
- [x] Migration `20261017180000_importacao_e_painel.sql`: lotes com hash, ID externo único, cobertura, gasto por dia e totais por categoria.
- [x] Importação: leitura no navegador (UTF-8/Latin-1), separador automático, mapeamento, prévia, revisão de duplicatas, lote tudo-ou-nada.
- [x] Visão geral: filtro de mês e conta, ritmo diário/acumulado com mês anterior, médias com fórmula, projeção só com cobertura total, mapa de calor clicável, principais categorias.
- [x] Categorias: valores do mês, participação, rosca de despesas e receitas separadas; Transações filtráveis por dia.
- [ ] **Você:** aplicar a migration 20261017180000 e rodar os comandos de Git (`docs/entregas/03-importacao-e-painel.md`).
- [ ] Conferir as telas novas no navegador logado.

## Próximas
- [ ] Entrega 04 — Cartões e faturas. 05 — Parcelamentos. 06 — Assinaturas. 07 — Publicação.

## Antes de publicar na internet
- [ ] Trocar a senha de 6 números por uma senha longa (a entrada fica exposta quando o app estiver online).
