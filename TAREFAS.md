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
- [x] Migration 20261017180000 aplicada; código no GitHub.
- [ ] Conferir as telas novas no navegador logado.

## Entrega 04 — Cartões e faturas
- [x] Migration `20261017210000_cartoes.sql`: cartões, fatura por data de fechamento, pagamento de fatura, limite comprometido.
- [x] Compra no cartão conta como gasto na data e não mexe no saldo; pagamento sai da conta sem contar a compra de novo.
- [x] Tela Cartões: limite total/comprometido/disponível, faturas com fechamento, vencimento e situação (aberta, fechada, paga, parcial, atrasada), detalhe com compras, encargos, estornos e pagamentos; "Pagar fatura".
- [x] Transações: "Pago com" conta ou cartão, pagamento de fatura, filtro por cartão; Visão geral com limites e próximos vencimentos.
- [x] Migration 20261017210000 aplicada; código no GitHub.
- [ ] Conferir as telas novas no navegador logado.

## Entrega 05 — Parcelamentos
- [x] Migration `20261017230000_parcelamentos.sql`: planos, parcelas com centavos exatos, proteção do total, cancelamento com/sem estorno.
- [x] Parcelas na conta exigem confirmação de pagamento; no cartão vão para a fatura do mês e comprometem o limite.
- [x] Tela Parcelamentos: criar com prévia da divisão, cronograma, pagas/pendentes, restante, progresso, confirmar/desfazer, cancelar.
- [x] Transações: parcela editável só em descrição/data/categoria; atalho para o parcelamento.
- [x] Migration 20261017230000 aplicada; código no GitHub.
- [ ] Conferir as telas no navegador logado.

## Entrega 06 — Assinaturas pessoais
- [x] Migration `20261017235000_assinaturas.sql`: cadastro, próxima data mantendo o dia da cobrança, registro de cobrança atômico.
- [x] Tela Assinaturas: serviço, valor, periodicidade, conta/cartão, categoria, próxima cobrança, status; total mensal equivalente com fórmula; custo anual; últimas cobranças.
- [x] Previsão não é despesa; "Registrar cobrança" cria um único lançamento e avança a data. Visão geral com próximas cobranças.
- [ ] **Você:** aplicar a migration 20261017235000 e rodar os comandos de Git (`docs/entregas/06-assinaturas.md`).
- [ ] Conferir as telas no navegador logado.

## Entrega 07 — Publicação controlada
- [x] Cabeçalhos de segurança (sem iframe, HSTS, nosniff, permissões), sem indexação (robots + noindex), sem cabeçalho "powered by".
- [x] Cópia de segurança completa em JSON (Configurações), protegida por login.
- [x] Teste em modo produção local: cabeçalhos, robots, rotas privadas redirecionando, login com CSP.
- [x] Guia `docs/PUBLICACAO.md` (Vercel, variáveis, Auth, proteção de previews, ordem banco → código, voltar versão, limites gratuitos).
- [ ] **Você:** concluir a Entrega 06 (migration + commit), trocar para senha forte, baixar uma cópia e publicar seguindo `docs/entregas/07-publicacao.md`.
- [ ] Conferir o app publicado no computador e no celular.

## Próximas

## Antes de publicar na internet
- [ ] Trocar a senha de 6 números por uma senha longa (a entrada fica exposta quando o app estiver online).
