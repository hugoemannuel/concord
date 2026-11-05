import assert from 'node:assert/strict'
import { test } from 'node:test'
import { classify, dependents, goPackages, parseArgs, parseGoList, scriptTests } from './affected.mjs'

test('classify separa Go, TS e scripts e detecta código compartilhado', () => {
  const result = classify(['backend/internal/call/service.go', 'frontend/src/renderer/src/features/chat/lib/x.ts', 'scripts/a.mjs', 'README.md'])
  assert.deepEqual(result.go, ['backend/internal/call/service.go'])
  assert.deepEqual(result.ts, ['frontend/src/renderer/src/features/chat/lib/x.ts'])
  assert.deepEqual(result.scripts, ['scripts/a.mjs'])
  assert.equal(result.shared, false)
  assert.equal(classify(['backend/internal/platform/database/db.go']).shared, true)
})

test('classify: mexer no DSP em Rust ou no .wasm dele confere o .wasm commitado', () => {
  for (const file of ['native/concord-dsp/src/voice_mod.rs', 'frontend/src/renderer/src/features/call/lib/concordDsp.wasm']) {
    assert.deepEqual(classify([file]).scripts, ['scripts/dsp-wasm.mjs'], file)
  }
  assert.deepEqual(classify(['native/concord-audio/src/main.rs']).scripts, [])
})

test('goPackages: diretórios únicos relativos a backend/', () => {
  assert.deepEqual(goPackages(['backend/internal/call/a.go', 'backend/internal/call/b_test.go', 'backend/cmd/main.go']), ['./cmd', './internal/call'])
})

test('dependents: fecho reverso, inclusive dependência de teste', () => {
  const graph = parseGoList(['m/a|', 'm/b|m/a|', 'm/c||m/b', 'm/d|m/x|'].join('\n'))
  assert.deepEqual(dependents(graph, ['m/a']), ['m/a', 'm/b', 'm/c'])
})

test('scriptTests: acha o .test.mjs vizinho e mantém testes alterados', () => {
  const exists = (f) => ['scripts/a.test.mjs', 'scripts/lib/b.test.mjs'].includes(f)
  assert.deepEqual(scriptTests(['scripts/a.mjs', 'scripts/sem-teste.mjs', 'scripts/lib/b.test.mjs'], exists), ['scripts/a.test.mjs', 'scripts/lib/b.test.mjs'])
})

test('classify: scripts do site/ (.js/.mjs) entram em scripts, HTML não', () => {
  assert.deepEqual(classify(['site/detect-os.js', 'site/index.html']).scripts, ['site/detect-os.js'])
})

test('scriptTests: x.js do site vira x.test.mjs e testes alterados entram direto', () => {
  const exists = (f) => ['site/detect-os.test.mjs', 'site/plugins/placar/rules.test.mjs'].includes(f)
  assert.deepEqual(scriptTests(['site/detect-os.js', 'site/plugins/placar/rules.test.mjs'], exists), ['site/detect-os.test.mjs', 'site/plugins/placar/rules.test.mjs'])
})

// Regressão: sem --base, indexOf dava -1 e o args[0] ("pr") era descartado
// como se fosse o valor do --base; o pr rodava como loop e pulava vet/CRAP.
test('parseArgs: modo sem --base não é descartado', () => {
  assert.deepEqual(parseArgs(['pr']), { mode: 'pr', base: null })
  assert.deepEqual(parseArgs([]), { mode: 'loop', base: null })
})

test('parseArgs: --base em qualquer posição', () => {
  assert.deepEqual(parseArgs(['pr', '--base', 'origin/main']), { mode: 'pr', base: 'origin/main' })
  assert.deepEqual(parseArgs(['--base', 'origin/main', 'full']), { mode: 'full', base: 'origin/main' })
})

// Modo com typo ("prr") ou --base sem valor rodavam loop calados e diziam verde.
test('parseArgs: modo desconhecido é erro', () => {
  assert.throws(() => parseArgs(['prr']), /modo desconhecido: prr/)
})

test('parseArgs: --base sem valor é erro', () => {
  assert.throws(() => parseArgs(['pr', '--base']), /--base sem valor/)
  assert.throws(() => parseArgs(['--base', '--x', 'pr']), /--base sem valor/)
})

test('classify: arquivos de mobile/src e mobile/app viram o grupo mobile', () => {
  const result = classify(['mobile/src/features/auth/lib/x.ts', 'mobile/app/_layout.tsx', 'mobile/app.config.ts', 'mobile/src/features/auth/lib/x.test.ts'])
  assert.deepEqual(result.mobile, ['mobile/src/features/auth/lib/x.ts', 'mobile/app/_layout.tsx', 'mobile/src/features/auth/lib/x.test.ts'])
  assert.deepEqual(result.ts, [])
  assert.equal(result.shared, false)
  // código compartilhado do mobile roda a suíte do mobile, não a do backend/desktop
  assert.equal(classify(['mobile/package.json']).shared, false)
  assert.equal(classify(['mobile/package.json']).mobileShared, true)
  assert.equal(classify(['mobile/src/shared/api/client.ts']).mobileShared, true)
  assert.equal(classify(['mobile/src/features/auth/lib/x.ts']).mobileShared, false)
})
