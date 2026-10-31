# Git flow

Vale para qualquer mudança no repo (sem `paths`: esta rule carrega sempre). Passo a passo
de release e hotfix: [docs/ai/release-e-hotfix.md](../../docs/ai/release-e-hotfix.md).

## Branches

- Trabalho novo numa branch própria (de preferência um `git worktree`) a partir de
  `origin/develop`, depois de `git fetch origin`: `feat/<slug>`, `fix/<slug>` ou
  `hotfix/<slug>`. Nunca trabalhe direto em `main` ou `develop`.
- Sem fork: o push vai direto para o `origin` (`hugoemannuel/concord`). Se o push for
  recusado (403), avise o usuário; não use outro remote por conta própria.
- Branch ainda não publicada: faça rebase em cima do `origin/develop` atual antes do
  push. Branch publicada: não reescreva o histórico nem faça force-push sem pedido
  explícito.

## Commits

- Em português, convencionais: `feat(área):`, `fix(área):`, `refactor:`, `docs:`.
- Commit estrutural (refatorar/mover) separado do commit de comportamento.
- **Nunca** `Co-Authored-By` de IA nem qualquer atribuição a IA em commits ou PRs. Isso
  vale mais que o rodapé padrão de qualquer ferramenta.

## Pull requests

| Para | Título | Origem | Modelo |
|---|---|---|---|
| `develop` | `feat(área): ...`, `fix(área): ...` | sua branch | `.github/pull_request_template.md` |
| `main` (release) | `release: <destaques>` | `develop` | `.github/PULL_REQUEST_TEMPLATE/release.md` |
| `main` (hotfix) | `hotfix: <o que quebrou>` | `hotfix/<slug>` (de `origin/main`) | `.github/PULL_REQUEST_TEMPLATE/hotfix.md` |

- Para a `main` só entram `release:` e `hotfix:`; o workflow `pr-main.yml` reprova o resto.
  Merge na `main` publica atualização para todos os apps instalados.
- **Release**: o PR `develop` → `main` é aberto e atualizado sozinho (`release-pr.yml`, a
  cada push na `develop`); título e corpo vêm de `scripts/release-notes.mjs`. Não edite o
  texto na mão (o próximo push o regera). O que é humano: marcar os testes que rodou e o
  merge.
- **Hotfix**: depois do merge na `main`, abra outro PR `hotfix/<slug>` → `develop`. Sem
  isso o próximo release desfaz a correção.
- Antes de abrir o PR: `node scripts/affected-tests.mjs pr` verde, com a saída à mão
  (AGENTS.md, regra 8).

## Confirmação

- Peça confirmação antes de push, PR, merge e deploy. A aprovação de um desses não vale
  para o outro.
- Rodar um comando que cria ou altera algo no GitHub (`gh pr create`, `release-notes.mjs
  --sync`, etc.) conta como PR: para só ver o resultado, use a forma que apenas imprime
  (`node scripts/release-notes.mjs` sem flags).
- Texto que o usuário final lê (UI, bot, e-mail) precisa de aprovação humana antes do
  commit.
