import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { EMPTY_NOTES, MAX_ENTRIES, MAX_ENTRY_TEXT, MAX_SOURCE, parseNotes, publishError, readPending } from './publish-changelog.mjs'

test('separa novidades e correções, na ordem do arquivo', () => {
  const md = [
    '## Novidades',
    '- Changelog global',
    '* Outra novidade',
    '',
    '## Correções',
    '- Corrigido o som'
  ].join('\n')
  assert.deepEqual(parseNotes(md).entries, [
    { kind: 'feature', text: 'Changelog global' },
    { kind: 'feature', text: 'Outra novidade' },
    { kind: 'fix', text: 'Corrigido o som' }
  ])
})

test('arquivo vazio ou só com os títulos não tem entradas', () => {
  assert.deepEqual(parseNotes('').entries, [])
  assert.deepEqual(parseNotes(EMPTY_NOTES).entries, [])
})

test('bullet fora de uma seção é erro (evita publicar como o tipo errado)', () => {
  assert.throws(() => parseNotes('- solto'), /seção/)
})

test('seção desconhecida é erro', () => {
  assert.throws(() => parseNotes('## Outros\n- x'), /Outros/)
})

// Regressão da 0.6.43: a nota passou do limite do servidor e só o deploy viu.
test('nota acima do limite do servidor é erro antes do deploy', () => {
  const longa = 'é'.repeat(MAX_ENTRY_TEXT + 1)
  assert.throws(() => parseNotes(`## Novidades\n- ${longa}`), /1001 caracteres/)
})

test('o limite conta caracteres, não bytes', () => {
  const acentuada = 'ã'.repeat(MAX_ENTRY_TEXT)
  assert.equal(parseNotes(`## Correções\n- ${acentuada}`).entries[0].text, acentuada)
})

test('mais entradas que o servidor aceita é erro', () => {
  const bullets = Array.from({ length: MAX_ENTRIES + 1 }, (_, i) => `- nota ${i}`)
  assert.throws(() => parseNotes(['## Novidades', ...bullets].join('\n')), /entradas/)
})

test('falha no PUT mostra o motivo que o servidor deu', async () => {
  const res = new Response('{"error":"texto inválido"}', { status: 400 })
  assert.equal(
    await publishError('0.6.43', res),
    'PUT /api/changelog/0.6.43: HTTP 400 {"error":"texto inválido"}'
  )
})

/** Pasta de notas num diretório temporário: { 'a.md': '...' }. */
function pendingDir(files) {
  const dir = join(mkdtempSync(join(tmpdir(), 'changelog-')), 'pending')
  mkdirSync(dir)
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content)
  return dir
}

test('parseNotes marca cada nota com o arquivo de origem', () => {
  assert.deepEqual(parseNotes('## Correções\n- Som', '2026-10-30-som.md').entries, [
    { kind: 'fix', text: 'Som', source: '2026-10-30-som.md' }
  ])
})

// Regressão: o next.md acumulava e a identidade da nota era o texto; agora é o arquivo.
test('readPending lê a pasta, do arquivo mais novo para o mais antigo, ignorando o README', () => {
  const dir = pendingDir({
    '2026-10-28-velha.md': '## Novidades\n- Velha\n',
    '2026-10-30-nova.md': '## Novidades\n- Nova\n\n## Correções\n- Bug\n',
    'README.md': '## Novidades\n- Isto é doc\n',
    'notas.txt': 'ignorado'
  })
  const { entries, names } = readPending(dir)
  assert.deepEqual(names, ['2026-10-30-nova.md', '2026-10-28-velha.md'])
  assert.deepEqual(entries, [
    { kind: 'feature', text: 'Nova', source: '2026-10-30-nova.md' },
    { kind: 'fix', text: 'Bug', source: '2026-10-30-nova.md' },
    { kind: 'feature', text: 'Velha', source: '2026-10-28-velha.md' }
  ])
})

test('readPending de pasta vazia não tem entradas', () => {
  assert.deepEqual(readPending(pendingDir({})), { entries: [], names: [] })
})

test('erro numa nota diz de qual arquivo ela é', () => {
  const dir = pendingDir({ 'quebrado.md': '- solto\n' })
  assert.throws(() => readPending(dir), /quebrado\.md: bullet fora de uma seção/)
})

test('nome de arquivo maior que o limite do servidor é erro antes do deploy', () => {
  const dir = pendingDir({ [`${'a'.repeat(MAX_SOURCE)}.md`]: '## Novidades\n- x\n' })
  assert.throws(() => readPending(dir), /nome de arquivo/)
})

test('--check valida a pasta sem publicar (roda no affected-tests pr)', () => {
  const dir = pendingDir({ 'a.md': '## Novidades\n- Curta\n' })
  const run = () => spawnSync(process.execPath, ['scripts/publish-changelog.mjs', '--check', dir], { encoding: 'utf8' })
  assert.equal(run().status, 0)
  writeFileSync(join(dir, 'b.md'), `## Novidades\n- ${'x'.repeat(MAX_ENTRY_TEXT + 1)}\n`)
  const longa = run()
  assert.equal(longa.status, 1)
  assert.match(longa.stderr, /b\.md: nota com 1001 caracteres/)
})

test('--check sem pasta mostra o uso', () => {
  const r = spawnSync(process.execPath, ['scripts/publish-changelog.mjs', '--check'], { encoding: 'utf8' })
  assert.equal(r.status, 1)
  assert.match(r.stderr, /uso:.*--check/)
})

// Os arquivos publicados ficam no git (o CI não os apaga): o envio não mexe neles
// e leva a origem de cada nota para o servidor decidir o que já saiu.
test('publicar envia a origem de cada nota e não mexe nos arquivos', async () => {
  let body = ''
  const server = createServer((req, res) => {
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => res.writeHead(204).end())
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const notes = '## Novidades\n- Curta\n'
  const dir = pendingDir({ 'a.md': notes })
  const child = spawn(process.execPath, ['scripts/publish-changelog.mjs', '0.6.46', dir, `http://127.0.0.1:${server.address().port}`], {
    env: { ...process.env, CHANGELOG_TOKEN: 'tok' }
  })
  const status = await new Promise((resolve) => child.on('exit', resolve))
  server.close()
  assert.equal(status, 0)
  assert.deepEqual(JSON.parse(body), { entries: [{ kind: 'feature', text: 'Curta', source: 'a.md' }] })
  assert.equal(readFileSync(join(dir, 'a.md'), 'utf8'), notes)
})

test('muitos arquivos juntos cabem no limite', () => {
  const bullets = Array.from({ length: 500 }, (_, i) => `- nota ${i}`)
  assert.equal(parseNotes(['## Novidades', ...bullets].join('\n')).entries.length, 500)
})

test('cabeçalho destaque marca todas as notas do arquivo', () => {
  const md = ['---', 'destaque: true', '---', '## Novidades', '- A', '## Correções', '- B'].join('\n')
  assert.deepEqual(parseNotes(md).entries, [
    { kind: 'feature', text: 'A', highlight: true },
    { kind: 'fix', text: 'B', highlight: true }
  ])
})

test('cabeçalho obrigatoria marca as notas como required (com CRLF do checkout)', () => {
  const md = ['---', 'obrigatoria: true', 'destaque: false', '---', '## Novidades', '- A'].join('\r\n')
  assert.deepEqual(parseNotes(md, 'x.md').entries, [{ kind: 'feature', text: 'A', source: 'x.md', required: true }])
})

test('chave desconhecida no cabeçalho é erro', () => {
  assert.throws(() => parseNotes('---\nobrigatório: true\n---\n## Novidades\n- A'), /chave desconhecida/)
})

test('valor do cabeçalho diferente de true/false é erro', () => {
  assert.throws(() => parseNotes('---\ndestaque: sim\n---\n## Novidades\n- A'), /true ou false/)
})

test('cabeçalho sem o fechamento é erro', () => {
  assert.throws(() => parseNotes('---\ndestaque: true\n## Novidades\n- A'), /cabeçalho/)
})

test('nota obrigatória sem nenhum bullet é erro (precisa explicar por quê)', () => {
  assert.throws(() => parseNotes('---\nobrigatoria: true\n---\n## Novidades\n'), /obrigatória/)
})
