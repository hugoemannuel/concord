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
