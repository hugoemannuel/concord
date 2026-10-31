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

1. `git fetch origin` e confira que a `develop` está como deve ir.
2. `node scripts/affected-tests.mjs full` e `node scripts/check-migrations.mjs origin/main`.
3. Gere o título e o corpo: `node scripts/release-notes.mjs`. Ele lê os PRs mergeados
   na `develop` desde a `main` (precisa do `gh` logado) e imprime o `release: ...` e o
   "O que muda" (um item por `feat`/`fix`/`perf`, com link e `closes #N` lido do texto do
   PR; `refactor`, `docs`, `chore` etc. viram uma linha `Manutenção: #N`). O "Como
   testar" vem de `.github/PULL_REQUEST_TEMPLATE/release.md`.
4. Confira o texto e abra o PR `develop` → `main`:
   `node scripts/release-notes.mjs --create` mostra o texto, pergunta `[s/N]` e roda
   `gh pr create`. Peça confirmação do usuário antes.
5. Marque os itens de "Como testar" que você rodou de fato.

## Hotfix

1. `git fetch origin` e crie `hotfix/<slug>` a partir de `origin/main`.
2. Siga o [pipeline-bugfix.md](pipeline-bugfix.md): causa raiz, teste de regressão e
   correção mínima.
3. Abra o PR `hotfix/<slug>` → `main` com o template:
   `https://github.com/hugoemannuel/concord/compare/main...hotfix/<slug>?template=hotfix.md&expand=1`
4. **Depois do merge**, abra o PR `hotfix/<slug>` → `develop`. Sem isso o próximo
   release desfaz a correção.

## Obrigatoriedade

A checagem só bloqueia o merge se for marcada como obrigatória na proteção da `main`
(Settings → Branches, check `tipo-do-pr`). É configuração do GitHub, feita pelo dono
do repositório.
