# FinanceOS — produto e roteiro

App pessoal de um único usuário por enquanto (o modelo continua isolado por usuário para virar SaaS depois). Finanças pessoais para brasileiros: lançamentos manuais e CSV, valores exatos em reais, isolamento total entre usuários. Sem conexão bancária (Open Finance) nem IA no MVP — e nada disso é simulado.

## Princípios
- Dinheiro em centavos exatos; datas como dias do calendário de Brasília.
- Resultado do mês (receitas − despesas) ≠ saldo bancário. Limite de cartão não é dinheiro disponível.
- Dia sem registro ≠ dia sem gasto. Média e projeção só com cobertura suficiente e fórmula explícita.
- Cada lançamento soma uma vez: categoria-pai não soma de novo as filhas; estorno/cashback reduz a compra; transferência própria, aporte/resgate, principal de empréstimo e pagamento de fatura têm natureza financeira própria.
- Arquivar preserva histórico; nada some dos relatórios sem ação explícita.

## Entregas
| Nº | Escopo | Estado |
|---|---|---|
| 01 | Fundação: Next.js, login único pelo Supabase Auth (sem cadastro público), perfil, contas manuais, catálogo de 15 categorias/141 subcategorias por usuário, RLS | aplicada no Supabase |
| 02 | Transações: receitas, despesas, transferência própria, estorno, filtros, lixeira, ocultar × excluir do relatório, exportação CSV | aplicada no Supabase |
| 03 | Importação CSV com prévia, mapeamento, lote atômico e revisão de duplicatas; Visão geral com ritmo, calor e categorias | aplicada no Supabase |
| 04 | Cartões e faturas (limite comprometido, pagamento sem dupla contagem) | implementada localmente; migration pendente |
| 05 | Parcelamentos (centavos exatos, confirmação de pagamento) | — |
| 06 | Assinaturas pessoais e próximos vencimentos | — |
| 07 | Publicação controlada (Vercel, produção, backup) | — |
| 08+ | Cobrança do SaaS, assistente de IA, Open Finance — com escopo próprio | — |

## Cartões
Compra no cartão = despesa na data da compra (entra no resultado e nas categorias), sem mexer no saldo de conta; aumenta a dívida do cartão. Fatura = mês em que fecha; compra no dia do fechamento ou depois vai para a próxima. Pagamento de fatura sai da conta e reduz a dívida, sem ser despesa. Comprometido = compras − estornos − pagamentos feitos, incluindo lançamentos futuros. Todas as faturas são estimadas (lançamentos manuais/CSV), não lidas do banco.

## Cobertura (como o painel evita inventar zero)
Um dia só é “sem gastos confirmados” quando um extrato importado daquela conta cobre aquele dia (período = primeira a última data do arquivo). Sem extrato e sem lançamento, o dia é “sem cobertura”. Com o filtro “todas as contas”, o dia precisa estar coberto em todas as contas ativas. Média por dia corrido e projeção só aparecem com todos os dias decorridos cobertos.

## Catálogo de categorias
Fonte única: `src/lib/catalog.ts` (15 categorias, 141 subcategorias). A migration de fundação copia o catálogo para cada usuário novo, uma única vez, com IDs próprios; o usuário pode renomear, criar e arquivar sem perder histórico.

## Referência visual
Inspiração: Pierre (pierre.finance). Ver `docs/REFERENCIA-PIERRE.md` — só a tela de login pública foi observada; a organização e a identidade do FinanceOS são próprias.
