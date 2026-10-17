# Git e GitHub — como funciona aqui

- **Commit** = foto do projeto salva **no seu computador**.
- **Push** = envia os commits para o **GitHub**. Sem push, o GitHub não vê nada.
- Você executa os comandos; o Claude escreve a lista exata em cada `docs/entregas/NN-*.md`.
- Nunca use `git add .` (pode levar arquivos que não são da entrega) nem `--force`.

## Primeira vez (Entrega 01)

A pasta já é um repositório Git local na branch `main`, ainda sem commits e sem GitHub ligado.

1. Em https://github.com/new crie um repositório **privado**, sem README, sem .gitignore e sem licença (vazio). Nome sugerido: `financeos-app`.
2. O GitHub mostra a URL, no formato `https://github.com/SEU_USUARIO/NOME.git`. Copie.
3. Siga os comandos do guia `docs/entregas/01-fundacao.md`, trocando a URL pela sua.

## Entregas seguintes

Cada entrega terá uma branch própria (ex.: `entrega-02-transacoes`), push dessa branch e um **pull request** para `main`, onde você revisa os arquivos antes de juntar. Quando a Vercel estiver ligada, cada pull request ganha um endereço de preview.

## Conferir depois do push

```powershell
git log -1 --oneline
git status
```

No GitHub, abra o repositório → **Commits**: o primeiro da lista deve ter a mesma mensagem e o mesmo código curto (7 letras) do `git log`.
