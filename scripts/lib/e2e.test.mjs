import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createApi, createE2E, ipSequence, parseBody, requestInit, toneWav, verifyToken } from './e2e.mjs'

// fakeFetch responde pela rota ("POST /auth/register") e guarda as chamadas.
function fakeFetch(routes) {
  const calls = []
  const impl = async (url, init) => {
    const path = url.replace('http://x/api', '')
    calls.push({ path, method: init.method, headers: init.headers, body: init.body && JSON.parse(init.body) })
    const answer = routes[`${init.method} ${path}`]
    const [status, body] = typeof answer === 'function' ? answer(calls.at(-1)) : (answer ?? [404, ''])
    const text = typeof body === 'string' ? body : JSON.stringify(body)
    return { status, ok: status >= 200 && status < 300, text: async () => text }
  }
  return { impl, calls }
}

test('parseBody lê JSON, devolve texto cru quando não é JSON e null quando vazio', () => {
  assert.deepEqual(parseBody('{"a":1}'), { a: 1 })
  assert.equal(parseBody('<html>502</html>'), '<html>502</html>')
  assert.equal(parseBody(''), null)
})

test('requestInit põe o Bearer só com token e não manda corpo vazio', () => {
  assert.deepEqual(requestInit(), { method: 'GET', headers: { 'Content-Type': 'application/json' }, body: undefined })
  const init = requestInit({ token: 't', method: 'POST', body: { a: 1 }, headers: { 'X-Forwarded-For': '10.0.0.1' } })
  assert.equal(init.headers.Authorization, 'Bearer t')
  assert.equal(init.headers['X-Forwarded-For'], '10.0.0.1')
  assert.equal(init.body, '{"a":1}')
})

test('api lança no status de erro; request devolve o status sem lançar', async () => {
  const { impl } = fakeFetch({ 'GET /ok': [200, { a: 1 }], 'GET /nao': [403, { error: 'email_not_verified' }] })
  const { api, request } = createApi('http://x/api', impl)
  assert.deepEqual(await api('/ok'), { a: 1 })
  await assert.rejects(api('/nao'), /GET \/nao -> 403 .*email_not_verified/)
  const res = await request('/nao')
  assert.equal(res.status, 403)
  assert.deepEqual(res.body, { error: 'email_not_verified' })
})

const LOG = [
  '[mailer] (SMTP não configurado) para ana-r1@teste.dev — Confirme seu e-mail',
  'Abra http://localhost:5173/verify-email?token=velho%2Bx para confirmar.',
  '[mailer] (SMTP não configurado) para bia-r1@teste.dev — Confirme seu e-mail',
  'Abra http://localhost:5173/verify-email?token=da-bia para confirmar.',
  '[mailer] (SMTP não configurado) para ana-r1@teste.dev — Confirme seu e-mail',
  'Abra http://localhost:5173/verify-email?token=novo%2By&x=1 para confirmar.'
].join('\n')

test('verifyToken pega o último link do e-mail certo, decodificado', () => {
  assert.equal(verifyToken(LOG, 'ana-r1@teste.dev'), 'novo+y')
  assert.equal(verifyToken(LOG, 'bia-r1@teste.dev'), 'da-bia')
  assert.equal(verifyToken(LOG, 'a-r1@teste.dev'), null)
  assert.equal(verifyToken('para caio-r1@teste.dev — Redefinir senha', 'caio-r1@teste.dev'), null)
})

test('ipSequence dá um IP diferente por cadastro', () => {
  const next = ipSequence('10.1.2')
  assert.deepEqual([next(), next()], ['10.1.2.1', '10.1.2.2'])
})

function backend(extra = {}) {
  return fakeFetch({
    'POST /auth/register': [201, { access_token: 'tok' }],
    'POST /auth/verify-email': ({ body }) => (body.token === 'tk-ana' ? [200, { message: 'ok' }] : [400, 'token']),
    'GET /users/me': [200, { id: 'u1', username: 'anarun', email_verified: true }],
    ...extra
  })
}
const anaLog = () => 'para ana-run@teste.dev — Confirme\nhttp://app/verify-email?token=tk-ana\n'

// Regressão: os makeUser antigos cadastravam sem confirmar o e-mail e quebraram
// quando entrar por convite passou a exigir e-mail confirmado.
test('makeUser cadastra, confirma o e-mail pelo log e devolve o usuário', async () => {
  const { impl, calls } = backend()
  const { makeUser } = createE2E({ api: 'http://x/api', run: 'run', readLog: anaLog, fetchImpl: impl })
  const ana = await makeUser('Ana')
  assert.deepEqual(calls.map((c) => `${c.method} ${c.path}`), ['POST /auth/register', 'POST /auth/verify-email', 'GET /users/me'])
  assert.deepEqual(calls[0].body, { username: 'Anarun', display_name: 'Ana', email: 'ana-run@teste.dev', password: 'senha-forte-123' })
  assert.match(calls[0].headers['X-Forwarded-For'], /^10\.\d+\.\d+\.1$/)
  assert.equal(ana.id, 'u1')
  assert.equal(ana.token, 'tok')
  assert.equal(ana.email, 'ana-run@teste.dev')
  assert.equal(ana.username, 'Anarun')
  assert.equal(ana.name, 'Ana')
  assert.equal(ana.email_verified, true)
})

test('registerUser não confirma o e-mail', async () => {
  const { impl, calls } = backend()
  const { registerUser } = createE2E({ api: 'http://x/api', run: 'run', readLog: anaLog, fetchImpl: impl })
  await registerUser('ana', { password: 'outra-senha-123' })
  assert.deepEqual(calls.map((c) => c.path), ['/auth/register', '/users/me'])
  assert.equal(calls[0].body.password, 'outra-senha-123')
})

test('makeUser tenta de novo no 429 e desiste no erro de verdade', async () => {
  let tries = 0
  const { impl } = backend({ 'POST /auth/register': () => (++tries < 3 ? [429, 'devagar'] : [201, { access_token: 'tok' }]) })
  const { makeUser } = createE2E({ api: 'http://x/api', run: 'run', readLog: anaLog, fetchImpl: impl, retryMs: 0 })
  assert.equal((await makeUser('ana')).token, 'tok')
  assert.equal(tries, 3)

  const taken = backend({ 'POST /auth/register': [409, { error: 'username taken' }] })
  const e2e = createE2E({ api: 'http://x/api', run: 'run', readLog: anaLog, fetchImpl: taken.impl, retryMs: 0 })
  await assert.rejects(e2e.makeUser('ana'), /cadastro de anarun: 409 .*username taken/)
})

test('verifyEmail desiste quando o e-mail não aparece no log', async () => {
  const { impl } = backend()
  const { verifyEmail } = createE2E({ api: 'http://x/api', readLog: () => '', fetchImpl: impl })
  await assert.rejects(verifyEmail('ninguem@teste.dev', { timeoutMs: 20, pollMs: 5 }), /ninguem@teste\.dev não apareceu/)
})

test('sem BACKEND_LOG, makeUser explica o que falta', async () => {
  const { impl } = backend()
  const saved = process.env.BACKEND_LOG
  delete process.env.BACKEND_LOG
  try {
    const { makeUser } = createE2E({ api: 'http://x/api', fetchImpl: impl })
    await assert.rejects(makeUser('ana'), /defina BACKEND_LOG/)
  } finally {
    if (saved !== undefined) process.env.BACKEND_LOG = saved
  }
})

test('toneWav gera WAV mono 16 bits do tamanho pedido, com tremolo opcional', () => {
  const wav = toneWav({ hz: 1000, seconds: 1, rate: 8000 })
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF')
  assert.equal(wav.toString('ascii', 8, 12), 'WAVE')
  assert.equal(wav.readUInt32LE(24), 8000)
  assert.equal(wav.readUInt32LE(40), 16000)
  assert.equal(wav.length, 44 + 16000)
  // 1000 Hz a 8 kHz: a amostra 2 cai no pico do seno.
  assert.equal(wav.readInt16LE(44 + 2 * 2), 12000)
  const soft = toneWav({ hz: 1000, seconds: 1, rate: 8000, tremolo: 0.4 })
  assert.ok(Math.abs(soft.readInt16LE(44 + 2 * 2)) < 12000)
})
