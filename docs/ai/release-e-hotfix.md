# PR para a `main`: release ou hotfix

A `main` publica atualização para todos os apps instalados, então só entram dois
tipos de PR nela. Feature e fix comuns continuam indo para a `develop`
([pipeline-feature.md](pipeline-feature.md), [pipeline-bugfix.md](pipeline-bugfix.md)).

| Tipo | Título | Origem | Template |
|---|---|---|---|
| release | `release: <destaques>` | `develop` | `release.md` |
| hotfix | `hotfix: <o que quebrou>` | `hotfix/<slug>` (de `origin/main`) | `hotfix.md` |

Um workflow (`.github/workflows/pr-main.yml`) reprova o PR para a `main` cujo título
não começa com `release: ` ou `hotfix: ` seguido do resumo, ou cuja origem não é a do
tipo. Editar o título refaz a checagem. Para testar na mão:
`PR_TITLE="release: x" PR_HEAD=develop node scripts/check-pr-main.mjs`.

## Release

O PR de release é aberto e atualizado **sozinho**: a cada push na `develop`, o workflow
`.github/workflows/release-pr.yml` roda `node scripts/release-notes.mjs --sync`, que
cria o PR `develop` → `main` ou atualiza título e corpo do que já está aberto. Se a
`develop` não tem nada novo, não faz nada.

O texto sai dos PRs mergeados na `develop` desde a `main`: título `release: ...` com os
`feat` (sem `feat`, os `fix`), um item por `feat`/`fix`/`perf` com link e `closes #N`
(lido do texto do PR, porque o GitHub não preenche isso na `develop`), e `Manutenção: #N`
para o resto. O "Como testar" vem de `.github/PULL_REQUEST_TEMPLATE/release.md`.

O que **você** faz:

1. `node scripts/affected-tests.mjs full` e `node scripts/check-migrations.mjs origin/main`.
2. Marque os itens de "Como testar" que rodou de fato. Um push novo na `develop` regera o
   corpo e desmarca tudo (código novo pede teste de novo); não edite o texto na mão, ele
   seria sobrescrito.
3. **Merge**: é humano, porque publica atualização para todos os apps instalados.

Para ver o texto sem abrir nada, ou abrir na hora com confirmação (sem esperar o workflow):
`node scripts/release-notes.mjs` e `node scripts/release-notes.mjs --create` (precisa do
`gh` logado).

## Hotfix

1. `git fetch origin` e crie `hotfix/<slug>` a partir de `origin/main`.
2. Siga o [pipeline-bugfix.md](pipeline-bugfix.md): causa raiz, teste de regressão e
   correção mínima.
3. Abra o PR `hotfix/<slug>` → `main` com o template:
   `https://github.com/hugoemannuel/concord/compare/main...hotfix/<slug>?template=hotfix.md&expand=1`
4. **Depois do merge**, abra o PR `hotfix/<slug>` → `develop`. Sem isso o próximo
   release desfaz a correção.

## Configuração do repositório (quem administra)

- Settings → Actions → General → **Allow GitHub Actions to create and approve pull
  requests**: sem isso o `release-pr.yml` não consegue abrir o PR.
- Secret `RELEASE_PR_TOKEN` (opcional; PAT ou token de GitHub App com `pull-requests: write`):
  PR aberto com o `GITHUB_TOKEN` não dispara outros workflows, então sem o secret o check
  `tipo-do-pr` não roda no PR de release.
- Settings → Branches → regra da `main`: marcar o check `tipo-do-pr` como obrigatório. Sem
  isso a checagem avisa, mas não bloqueia o merge. Se marcar sem o `RELEASE_PR_TOKEN`, o PR de
  release fica esperando esse check para sempre.
