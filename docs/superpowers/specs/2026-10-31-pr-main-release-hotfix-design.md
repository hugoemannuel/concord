# PRs para a main: só `release` ou `hotfix`

## Objetivo

Todo PR para a `main` (que publica atualização para todos os apps instalados) segue um
de dois tipos, com título, branch de origem e corpo padronizados. O modelo é o
PR #469 (`release: Ouvir também direto, GIFs favoritos, ...`, de `develop` para `main`).

## Decisões

| Decisão | Escolha | Por quê |
|---|---|---|
| Tipos | `release` (origem `develop`) e `hotfix` (origem `hotfix/<slug>`, criada de `origin/main`) | Pedido do usuário. Feature e fix comuns continuam indo para a `develop`. |
| Título | `release: <resumo>` ou `hotfix: <resumo>`, em português | Mesmo padrão do #469 e dos commits convencionais. |
| Hotfix volta para a develop | Depois do merge, outro PR leva o hotfix de volta para a `develop` | Senão o próximo release o desfaz. |
| Templates | `.github/PULL_REQUEST_TEMPLATE/release.md` e `hotfix.md`; o `pull_request_template.md` atual segue como padrão da `develop` | O GitHub escolhe o template por `?template=`; o padrão não muda. |
| Corpo do release | "O que muda" (um item por PR, com `closes #N`) e "Como testar" (`affected-tests.mjs full`, `check-migrations.mjs origin/main`) | É o corpo do #469. |
| Corpo do hotfix | "O que muda" (causa raiz), "Como testar" (teste de regressão, `affected-tests.mjs pr`, `check-migrations.mjs origin/main`) e "PR de volta para develop aberto" | Bug corrigido sempre vem com teste de regressão (AGENTS.md, regra 5). |
| Checagem | `scripts/check-pr-main.mjs` (função pura `checkPrMain({ title, head })` devolvendo a lista de erros) chamada pelo workflow `.github/workflows/pr-main.yml` em PR para a `main` (`opened`, `edited`, `synchronize`, `reopened`) | Testável como os outros scripts, sem rodar a suíte no Actions (economiza minutos). |
| Entrada no workflow | Título e branch por variável de ambiente, nunca interpolados no shell | Título de PR é texto livre: evita injeção de comando. |
| Obrigatoriedade | Marcar a checagem como obrigatória na proteção da `main` (configuração do GitHub, feita pelo dono do repo) | Sem isso a checagem avisa, mas não bloqueia o merge. |
| Mensagens do release | Geradas por `scripts/release-notes.mjs` (funções puras `parseMergedPrs`, `extractCloses`, `buildRelease` + CLI com `git` e `gh`; `--create` pergunta `[s/N]` e abre o PR). Título `release: <feat1, feat2 e feat3>` (corte em 100 caracteres: `e mais N`; sem `feat` usa os `fix`; sem nenhum, `manutenção`). Corpo: um item por `feat`/`fix`/`perf` no formato do #469, `Manutenção: #N` para o resto, `Como testar` copiado do template de release. | Pedido do usuário (2026-10-31): mensagens do release automatizadas, sem escrever à mão. Os `closes #N` vêm do texto dos PRs porque o `closingIssuesReferences` do GitHub vem vazio para PRs que entram na develop. Hotfix continua manual. |
| PR de release automático | Workflow `release-pr.yml` a cada push na `develop` roda `release-notes.mjs --sync` (`syncAction`: pular, criar ou atualizar o PR `develop` → `main` aberto). Só abre/edita o PR; **o merge é humano**. Token: `RELEASE_PR_TOKEN` se existir, senão `GITHUB_TOKEN`. | Pedido do usuário (2026-10-31): totalmente automatizado, escolhida a opção "PR automático, merge humano"; merge automático publicaria para todos os apps sem revisão. PR aberto com `GITHUB_TOKEN` não dispara outros workflows (o check `tipo-do-pr` não rodaria) e criar PR por Actions exige configuração de admin: ambos documentados. |
| ADR | Não | Sem dependência nova e sem fuga de padrão. |

## Regras da checagem

- Título: `^(release|hotfix): \S`. Qualquer outro título é erro.
- `release:` exige origem `develop`; `hotfix:` exige origem que comece com `hotfix/`.
- A mensagem de erro diz o que foi encontrado e o que se espera, em português.
- PR de fork (origem `fulano:develop`) é comparado só pelo nome da branch.

## Arquivos

- `.github/PULL_REQUEST_TEMPLATE/release.md`, `.github/PULL_REQUEST_TEMPLATE/hotfix.md` (novos)
- `.github/workflows/pr-main.yml` (novo)
- `scripts/check-pr-main.mjs` e `scripts/check-pr-main.test.mjs` (novos)
- `scripts/release-notes.mjs` e `scripts/release-notes.test.mjs` (novos)
- `.github/workflows/release-pr.yml` (novo)
- `docs/ai/release-e-hotfix.md` (novo): passo a passo (criar a branch, abrir o PR, voltar o hotfix para a develop)
- `AGENTS.md § Convenções do repo`: um bullet com a regra e o link para o doc

## Entrega

Branch a partir de `origin/develop`. Commit estrutural (templates e docs) separado do
de comportamento (script, teste e workflow). PR para `develop`. O texto dos templates é
lido por pessoas: precisa de aprovação humana antes do commit. Sem push nem PR sem
confirmação.

## Testes

`check-pr-main.test.mjs`: release válido; hotfix válido; título sem prefixo; release
fora da `develop`; hotfix fora de `hotfix/`; prefixo sem resumo; branch de fork.
