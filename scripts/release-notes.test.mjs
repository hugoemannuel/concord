import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildRelease, extractCloses, parseMergedPrs } from './release-notes.mjs'

const pr = (number, title, body = '') => ({ number, title, body, url: `https://github.com/o/r/pull/${number}` })

const TEMPLATE = `<!-- comentário do template -->

## O que muda

<!-- exemplo -->

## Como testar

- [ ] passo um
- [ ] passo dois
`

test('parseMergedPrs: números dos PRs nos merges, na ordem', () => {
  const subjects = [
    'Merge pull request #468 from hugoemannuel/feat/auditoria-servidor',
    'Merge remote-tracking branch origin/develop into feat/x',
    'Merge pull request #467 from hugoemannuel/feat/sons-notificacao'
  ]
  assert.deepEqual(parseMergedPrs(subjects), [468, 467])
})

test('extractCloses: closes, fixes e resolves, sem repetir e em ordem', () => {
  const text = 'Closes #343. Também fixes #12 e Resolved #343; veja #99 e fix #7'
  assert.deepEqual(extractCloses(text), [7, 12, 343])
})

test('extractCloses: sem palavra-chave não fecha nada', () => {
  assert.deepEqual(extractCloses('relacionado a #10'), [])
  assert.deepEqual(extractCloses(''), [])
})

test('buildRelease: item por feat/fix no formato do #469, com closes', () => {
  const { title, body } = buildRelease(
    [pr(467, 'feat(sons): sons de notificação personalizados por pessoa', 'Closes #461'), pr(465, 'fix(atividade): Ouvir também abre a faixa')],
    TEMPLATE
  )
  assert.equal(title, 'release: Sons de notificação personalizados por pessoa')
  assert.match(body, /^## O que muda\n\n/)
  assert.match(
    body,
    /- Sons de notificação personalizados por pessoa \(\[feat\(sons\): sons de notificação personalizados por pessoa #467\]\(https:\/\/github\.com\/o\/r\/pull\/467\)\) — closes #461\n/
  )
  assert.match(body, /- Ouvir também abre a faixa \(\[fix\(atividade\): Ouvir também abre a faixa #465\]\([^)]+\)\)\n/)
  assert.doesNotMatch(body, /Ouvir também abre a faixa #465\]\([^)]+\)\) — closes/)
})

test('buildRelease: o título usa só os feat quando há feat', () => {
  const { title } = buildRelease([pr(1, 'feat(a): coisa nova'), pr(2, 'fix(b): conserto')], TEMPLATE)
  assert.equal(title, 'release: Coisa nova')
})

test('buildRelease: sem feat usa os fix; sem nenhum dos dois, manutenção', () => {
  assert.equal(buildRelease([pr(2, 'fix(b): conserto')], TEMPLATE).title, 'release: Conserto')
  assert.equal(buildRelease([pr(3, 'chore: limpa')], TEMPLATE).title, 'release: manutenção')
  assert.equal(buildRelease([], TEMPLATE).title, 'release: manutenção')
})

test('buildRelease: três feat viram "a, b e c"', () => {
  const { title } = buildRelease([pr(1, 'feat: a'), pr(2, 'feat: b'), pr(3, 'feat: c')], TEMPLATE)
  assert.equal(title, 'release: A, b e c')
})

test('buildRelease: título longo é cortado em "e mais N"', () => {
  const prs = [1, 2, 3, 4, 5].map((n) => pr(n, `feat(x): funcionalidade bem comprida número ${n}`))
  const { title } = buildRelease(prs, TEMPLATE)
  assert.ok(title.length <= 100, `${title.length} caracteres`)
  assert.match(title, /^release: Funcionalidade bem comprida número 1/)
  assert.match(title, / e mais \d+$/)
})

test('buildRelease: refactor, docs e chore viram uma linha de manutenção', () => {
  const { body } = buildRelease([pr(1, 'feat: a'), pr(10, 'refactor(call): divide'), pr(11, 'docs: texto'), pr(12, 'chore: limpa')], TEMPLATE)
  assert.match(body, /\nManutenção: #10, #11, #12\n/)
  assert.doesNotMatch(body, /divide/)
})

test('buildRelease: sem PR de manutenção não há linha de manutenção', () => {
  assert.doesNotMatch(buildRelease([pr(1, 'feat: a')], TEMPLATE).body, /Manutenção/)
})

test('buildRelease: o "Como testar" vem do template, sem o resto dele', () => {
  const { body } = buildRelease([pr(1, 'feat: a')], TEMPLATE)
  assert.match(body, /\n## Como testar\n\n- \[ \] passo um\n- \[ \] passo dois\n$/)
  assert.doesNotMatch(body, /comentário do template|exemplo/)
})

test('buildRelease: título fora do padrão tipo(área): conta como manutenção', () => {
  const { body } = buildRelease([pr(5, 'Atualiza o README')], TEMPLATE)
  assert.match(body, /Manutenção: #5/)
})
