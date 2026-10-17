# Verificações

## Entrega 02 — Transações (17/10/2026, executado nesta sessão)

| Verificação | Resultado |
|---|---|
| `npm run lint` | passou |
| `npm run typecheck` | passou |
| `npm test` | 6 arquivos, 30 testes, todos passaram |
| `npm run build` | passou |
| `npm run check:supabase` | antes: Supabase vazio. Depois do `db push` do dono (17/10): as duas migrations "APLICADA" (todas as tabelas, views e funções existem; anônimo bloqueado) |

Cobertos no banco local (PGlite, as duas migrations): saldo e indicadores exatos; transferência sem alterar consolidado nem resultado; estorno limitado ao valor da compra, com categoria herdada e acompanhando troca; compra com estorno protegida (lixeira/valor menor); ocultar só da lista; excluir dos relatórios sem mexer no saldo; lixeira fora de tudo e restaurável; pendente fora do saldo; liquidado futuro recusado; conta arquivada, data antes do saldo inicial, categoria arquivada/incompatível e troca de tipo recusadas; data do saldo inicial protegida; busca com % literal; isolamento entre A, B e anônimo. Também: filtros da URL, intervalo de meses, escape da busca, CSV (aspas, sinal, centavos, proteção contra fórmula).

**Não verificado:** telas logadas no navegador (exigem o Supabase com as migrations) e `npm run test:rls` (ampliado para transações, ainda não executado).

## Entrega 01 — Fundação (16/10/2026, executado nesta sessão)

| Verificação | Resultado |
|---|---|
| `npm run lint` | passou, sem avisos |
| `npm run typecheck` | passou |
| `npm test` | 3 arquivos, 16 testes, todos passaram |
| `npm run build` | passou (Next.js 16.4.2) |
| `npm audit --omit=dev` | 0 vulnerabilidades nas dependências do app. Há 5 alertas "high" (`braces`) só em ferramentas de desenvolvimento do ESLint; não vão para o navegador nem para o servidor |

O que os testes cobrem:
- Dinheiro: formato brasileiro, recusa de entradas ambíguas, limite de R$ 999.999.999.999,99, formatação sem float, R$ 100,00 em 3 = 33,34 + 33,33 + 33,33, negativos.
- Datas: dia de Brasília (23h30 em Brasília continua o mesmo dia), datas impossíveis.
- Migration no PostgreSQL local (PGlite, com Auth simulado): roda inteira; catálogo 15/141 para usuário anterior e novo, sem duplicar ao repetir; dinheiro em texto exato; B não lê nem altera A; dono forjado, instituição alheia, data futura, valor acima do limite, DELETE, template forjado, subcategoria em categoria alheia ou arquivada e mudança de hierarquia recusados; anônimo bloqueado.

- Login único: `wanrley` → `wanrley@financeos.local`, e-mail completo aceito, entradas inválidas recusadas.

Navegador (http://127.0.0.1:3001, **sem Supabase configurado**):
- `/entrar` mostra Usuário e Senha, com a identidade escura/verde; `/` leva à Visão geral; `/cadastro` → "Página não encontrada".
- Na primeira versão (com cadastro), enviar o formulário mostrou "O Supabase ainda não foi configurado neste computador (.env.local)." — a mesma mensagem é usada no login.
- Telas internas mostram "Algo deu errado — Supabase não configurado…" (esperado sem Supabase).
- Celular 375×812: sem rolagem lateral; menu recolhível abre e lista as áreas.

## Pendente (depende de você criar o Supabase)
- `npm run check:supabase` e `npm run test:rls` contra o Supabase real.
- Entrar com `wanrley`, trocar senha, sair, contas e categorias com o usuário real.
- As telas de Contas, Categorias, Visão geral e Configurações **logado** ainda não foram vistas no navegador.
