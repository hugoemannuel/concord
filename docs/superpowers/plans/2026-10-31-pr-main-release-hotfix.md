# PRs para a main: release ou hotfix — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Todo PR para a `main` é `release:` (de `develop`) ou `hotfix:` (de `hotfix/<slug>`), com template, documentação e uma checagem no CI que reprova o resto.

**Architecture:** Dois templates em `.github/PULL_REQUEST_TEMPLATE/`, um doc de procedimento em `docs/ai/` e um bullet no `AGENTS.md` (commit estrutural). Uma função pura `checkPrMain` em `scripts/check-pr-main.mjs` (mesmo padrão do `check-migrations.mjs`), chamada por um workflow leve que só roda em PR para a `main` (commit de comportamento).

**Tech Stack:** Node (`node:test`, ESM `.mjs`), GitHub Actions. Nenhuma dependência nova.

## Global Constraints

Spec: `docs/superpowers/specs/2026-10-31-pr-main-release-hotfix-design.md`.

- Tipos de PR para a `main`: `release` (origem `develop`) e `hotfix` (origem `hotfix/<slug>`, criada de `origin/main`).
- Título: `release: <resumo>` ou `hotfix: <resumo>`, em português; regex `^(release|hotfix): \S`.
- Código, comentários, docs, UI e commits em **português**; commits convencionais.
- **Nunca** `Co-Authored-By` de IA nem atribuição a IA em commits ou PRs (AGENTS.md; vale mais que o rodapé padrão do Claude Code).
- Sem dependência nova; sem ADR.
- O workflow não roda testes (o CI não roda a suíte, para economizar minutos). Título e branch entram por variável de ambiente, nunca interpolados dentro do `run:`.
- CRAP ≤ 15 em toda função tocada. CRLF no checkout: não rode `prettier --write` nem formatador no repo inteiro.
- Texto que pessoas leem (templates, doc) precisa de aprovação do usuário antes do commit.
- Nada de `git push` nem PR sem confirmação do usuário.
- Branch `caiolucio360/gitflow`, a partir de `origin/develop`; PR para `develop`.

---

### Task 1: Templates, doc de procedimento e regra no AGENTS.md (commit estrutural)

**Files:**
- Create: `.github/PULL_REQUEST_TEMPLATE/release.md`
- Create: `.github/PULL_REQUEST_TEMPLATE/hotfix.md`
- Create: `docs/ai/release-e-hotfix.md`
- Modify: `AGENTS.md` (seção "Convenções do repo", logo depois do bullet "Trabalho novo numa branch própria...")

**Interfaces:**
- Produces: o caminho `docs/ai/release-e-hotfix.md`, que a Task 2 cita nas mensagens de erro e que o `AGENTS.md` linka.

- [ ] **Step 1: Criar `.github/PULL_REQUEST_TEMPLATE/release.md`**

```markdown
<!-- PR de release: develop → main. Título: "release: <destaques, separados por vírgula>".
     Merge na main publica atualização para todos os apps instalados. -->

## O que muda

<!-- Um item por PR que entra, com o link e, se houver, "closes #N". Exemplo:
- Sons de notificação personalizados ([feat(sons): sons de notificação personalizados por pessoa #467](link)) — closes #461
-->

## Como testar

- [ ] `node scripts/affected-tests.mjs full` verde na develop (diga o que rodou: backend, frontend, mobile)
- [ ] `node scripts/check-migrations.mjs origin/main`
```

- [ ] **Step 2: Criar `.github/PULL_REQUEST_TEMPLATE/hotfix.md`**

```markdown
<!-- PR de hotfix: hotfix/<slug> → main. Título: "hotfix: <o que quebrou, em uma frase>".
     Branch criada a partir de origin/main. Só correção urgente: nada de feature. -->

## O que muda

<!-- Uma ou duas frases: qual era a causa raiz e o que a correção faz. -->

## Como testar

- [ ] Teste de regressão que falhava antes da correção (nome do teste: <!-- cole aqui -->)
- [ ] `node scripts/affected-tests.mjs pr` verde (cole o resumo abaixo)
- [ ] `node scripts/check-migrations.mjs origin/main`

## Depois do merge

- [ ] PR de volta para a `develop` aberto (`hotfix/<slug>` → `develop`): <!-- #N -->
```

- [ ] **Step 3: Criar `docs/ai/release-e-hotfix.md`**

```markdown
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
3. Abra o PR `develop` → `main` com o template:
   `https://github.com/hugoemannuel/concord/compare/main...develop?template=release.md&expand=1`
4. "O que muda": um item por PR que entra, com `closes #N`. Título com os destaques.
5. Peça confirmação do usuário antes de abrir o PR.

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
```

- [ ] **Step 4: Adicionar o bullet no `AGENTS.md`**

Em "Convenções do repo", depois do bullet que termina em "Merge na `main` publica atualização para todos os apps instalados.", inserir:

```markdown
- PR para a `main` é só `release:` (de `develop`) ou `hotfix:` (de `hotfix/<slug>`),
  com o template do tipo; hotfix volta para a `develop` depois. Um workflow reprova o
  resto. → [docs/ai/release-e-hotfix.md](docs/ai/release-e-hotfix.md)
```

- [ ] **Step 5: Mostrar o texto ao usuário e esperar aprovação**

Mostre ao usuário o conteúdo final dos dois templates, do doc e do bullet. **Não commite antes do "ok".** Ajuste o que ele pedir.

- [ ] **Step 6: Conferir estrutura e commitar**

Run: `node scripts/check-structure.mjs`
Expected: sai com código 0 (nenhum arquivo solto novo).

```bash
git add .github/PULL_REQUEST_TEMPLATE docs/ai/release-e-hotfix.md AGENTS.md
git commit -m "docs(gitflow): templates e passo a passo de PR para a main (release e hotfix)"
```

---

### Task 2: Checagem de título e branch + workflow (commit de comportamento)

**Files:**
- Create: `scripts/check-pr-main.test.mjs`
- Create: `scripts/check-pr-main.mjs`
- Create: `.github/workflows/pr-main.yml`

**Interfaces:**
- Consumes: `docs/ai/release-e-hotfix.md` (Task 1), citado na mensagem de erro.
- Produces: `checkPrMain({ title: string, head: string }): string[]` — lista de erros, vazia se o PR está certo. CLI: lê `PR_TITLE` e `PR_HEAD` do ambiente, imprime `::error::<msg>` por erro e sai com 1 se houver algum.

- [ ] **Step 1: Escrever os testes que falham**

`scripts/check-pr-main.test.mjs`:

```js
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { checkPrMain } from './check-pr-main.mjs'

test('release válido: develop → main', () => {
  const title = 'release: Ouvir também direto, GIFs favoritos e sons de notificação'
  assert.deepEqual(checkPrMain({ title, head: 'develop' }), [])
})

test('hotfix válido: hotfix/<slug> → main', () => {
  assert.deepEqual(checkPrMain({ title: 'hotfix: live trava ao trocar de janela', head: 'hotfix/live-trava' }), [])
})

test('título sem o prefixo é erro, e a mensagem diz os dois formatos', () => {
  const errors = checkPrMain({ title: 'feat(gifs): GIFs favoritos', head: 'develop' })
  assert.equal(errors.length, 1)
  assert.match(errors[0], /feat\(gifs\): GIFs favoritos/)
  assert.match(errors[0], /"release: <resumo>".*"hotfix: <resumo>"/)
})

test('prefixo sem resumo é erro de título', () => {
  for (const title of ['release:', 'release: ', 'hotfix:']) {
    const errors = checkPrMain({ title, head: title.startsWith('release') ? 'develop' : 'hotfix/x' })
    assert.equal(errors.length, 1, title)
    assert.match(errors[0], /título/)
  }
})

test('título vazio ou ausente é erro', () => {
  assert.equal(checkPrMain({ title: '', head: 'develop' }).length, 1)
  assert.equal(checkPrMain({ head: 'develop' }).length, 1)
})

test('release que não sai da develop é erro', () => {
  const errors = checkPrMain({ title: 'release: tudo', head: 'feat/eventos' })
  assert.equal(errors.length, 1)
  assert.match(errors[0], /release/)
  assert.match(errors[0], /develop/)
  assert.match(errors[0], /feat\/eventos/)
})

test('hotfix que não sai de hotfix/ é erro', () => {
  for (const head of ['develop', 'fix/algo', 'hotfix/']) {
    const errors = checkPrMain({ title: 'hotfix: corrige algo', head })
    assert.equal(errors.length, 1, head)
    assert.match(errors[0], /hotfix\//)
  }
})

const workflow = readFileSync(new URL('../.github/workflows/pr-main.yml', import.meta.url), 'utf8')

test('o workflow roda em PR para a main, inclusive quando o título é editado', () => {
  assert.match(workflow, /branches: \[main\]/)
  assert.match(workflow, /types: \[opened, edited, synchronize, reopened\]/)
})

test('o workflow passa título e branch por env, nunca dentro do run', () => {
  const run = /^\s+run: (.+)$/m.exec(workflow)?.[1] ?? ''
  assert.ok(run, 'o workflow tem um passo com run')
  assert.doesNotMatch(run, /\$\{\{/)
  assert.match(workflow, /PR_TITLE: \$\{\{ github\.event\.pull_request\.title \}\}/)
  assert.match(workflow, /PR_HEAD: \$\{\{ github\.head_ref \}\}/)
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test scripts/check-pr-main.test.mjs`
Expected: FAIL com `Cannot find module` (`check-pr-main.mjs` não existe).

- [ ] **Step 3: Implementar `scripts/check-pr-main.mjs`**

```js
// Confere um PR para a main (docs/ai/release-e-hotfix.md): só `release:` (de
// develop) ou `hotfix:` (de hotfix/<slug>). O workflow pr-main.yml chama isto
// com o título e a branch de origem em PR_TITLE e PR_HEAD.
//
//   PR_TITLE="release: x" PR_HEAD=develop node scripts/check-pr-main.mjs

const TITLE = /^(release|hotfix): \S/
const KIND = /^(release|hotfix):/
const HOTFIX_HEAD = /^hotfix\/.+/

/** Devolve a lista de erros do PR (vazia = tudo certo). */
export function checkPrMain({ title = '', head = '' }) {
  if (!TITLE.test(title)) {
    return [
      `título "${title}" não serve para a main: use "release: <resumo>" (de develop) ` +
        `ou "hotfix: <resumo>" (de hotfix/<slug>). Veja docs/ai/release-e-hotfix.md`
    ]
  }
  const kind = KIND.exec(title)[1]
  if (kind === 'release' && head !== 'develop') {
    return [`release sai da develop, mas a origem é "${head}"`]
  }
  if (kind === 'hotfix' && !HOTFIX_HEAD.test(head)) {
    return [`hotfix sai de hotfix/<slug>, mas a origem é "${head}"`]
  }
  return []
}

if (process.argv[1]?.endsWith('check-pr-main.mjs')) {
  const errors = checkPrMain({ title: process.env.PR_TITLE, head: process.env.PR_HEAD })
  for (const e of errors) console.error(`::error::${e}`)
  if (errors.length > 0) process.exit(1)
  console.log('PR para a main ok')
}
```

- [ ] **Step 4: Criar `.github/workflows/pr-main.yml`**

```yaml
# Todo PR para a main é release (de develop) ou hotfix (de hotfix/<slug>):
# docs/ai/release-e-hotfix.md. Só confere título e branch de origem; não roda a
# suíte. Para bloquear o merge, marque o check "tipo-do-pr" como obrigatório na
# proteção da main (configuração do GitHub).
name: PR para a main

on:
  pull_request:
    branches: [main]
    types: [opened, edited, synchronize, reopened]

permissions:
  contents: read

jobs:
  tipo-do-pr:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7

      # Título é texto livre: entra por env, nunca interpolado no comando.
      - name: Conferir título e branch de origem
        env:
          PR_TITLE: ${{ github.event.pull_request.title }}
          PR_HEAD: ${{ github.head_ref }}
        run: node scripts/check-pr-main.mjs
```

- [ ] **Step 5: Rodar e ver passar**

Run: `node --test scripts/check-pr-main.test.mjs`
Expected: PASS, 9 testes, 0 falhas.

Conferência manual da CLI:

```bash
PR_TITLE="release: x" PR_HEAD=develop node scripts/check-pr-main.mjs
```
Expected: `PR para a main ok`, código 0.

```bash
PR_TITLE="feat: x" PR_HEAD=develop node scripts/check-pr-main.mjs; echo "código $?"
```
Expected: linha `::error::título "feat: x" não serve para a main...` e `código 1`.

- [ ] **Step 6: Evidência antes do commit (regra 8)**

Run: `node scripts/affected-tests.mjs pr`
Expected: verde (testes afetados, estrutura, design e CRAP; `checkPrMain` com CRAP ≤ 15). Se algo vermelho for de arquivo que não tocamos, mostre a saída ao usuário em vez de ignorar.

- [ ] **Step 7: Commitar**

```bash
git add scripts/check-pr-main.mjs scripts/check-pr-main.test.mjs .github/workflows/pr-main.yml
git commit -m "feat(gitflow): checagem de título e branch em PR para a main"
```

---

### Task 3 (acrescentada em 2026-10-31): mensagens do release geradas por script

**Files:**
- Create: `scripts/release-notes.test.mjs`, `scripts/release-notes.mjs`
- Modify: `docs/ai/release-e-hotfix.md` (passos 3 a 5 do release)

**Interfaces:**
- Consumes: `.github/PULL_REQUEST_TEMPLATE/release.md` (seção `## Como testar`).
- Produces: `parseMergedPrs(subjects: string[]): number[]`, `extractCloses(text: string): number[]`, `buildRelease(prs: {number,title,body,url}[], template: string): { title: string, body: string }`; CLI `node scripts/release-notes.mjs [--create]`.

Passos (TDD): escrever `release-notes.test.mjs` e ver falhar por módulo inexistente; implementar `release-notes.mjs`; rodar `node --test scripts/release-notes.test.mjs`; conferir com PRs reais (`gh pr view`); atualizar o doc; `node scripts/affected-tests.mjs pr`; commit `feat(gitflow): gera título e corpo do PR de release`.

## Depois das tasks

- Mostrar ao usuário a saída verde de `node scripts/affected-tests.mjs pr`.
- Perguntar se pode dar push e abrir o PR para `develop` com o `.github/pull_request_template.md` (nada de push nem PR sem o "ok").
- Lembrar o usuário de marcar o check `tipo-do-pr` como obrigatório na proteção da `main`.

## Autorrevisão contra a spec

- Tipos, título e hotfix voltando para a develop: Task 1 (doc, templates, AGENTS.md) e Task 2 (regras).
- Templates `release.md` e `hotfix.md`, padrão da `develop` intocado: Task 1, steps 1-2.
- `checkPrMain({ title, head })` e testes (release válido, hotfix válido, sem prefixo, sem resumo, release fora da develop, hotfix fora de `hotfix/`): Task 2, steps 1-5.
- Fork: `github.head_ref` já vem só com o nome da branch; coberto pelo teste do `PR_HEAD` e pelo fato de `checkPrMain` só receber o nome.
- Entrada por env, nunca no `run`: workflow + teste.
- Obrigatoriedade na proteção da `main`: doc e "Depois das duas tasks".
- Dois commits (estrutural e de comportamento), aprovação de texto, sem push sem confirmação: steps 5-6 da Task 1, step 7 da Task 2.
