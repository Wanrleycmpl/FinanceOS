# Verificações

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
