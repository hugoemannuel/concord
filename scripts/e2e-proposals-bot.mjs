// E2E do quadro de propostas com o GitHub e o Salinha Bot: backend de verdade
// (Postgres descartável) e um GitHub falso que registra as chamadas e simula o
// limite da API. Confere: responsável ao mover, confirmação ao tirar o card de
// outro dev (409 + take_over), Concluída mantém o responsável e fecha a issue,
// reabrir, assignee pelo login do GitHub, DM do Salinha Bot chegando e só
// leitura (403), e o limite da API: o card move, a issue espera o reset e
// continua sozinha.
//
//   cd backend && go build -o ../dist/e2e-backend ./cmd   (Windows: e2e-backend.exe)
//   docker exec concord-postgres psql -U concord-user -d concord -c "CREATE DATABASE concord_e2e_kanban"
//   BACKEND_BIN=dist/e2e-backend.exe node scripts/e2e-proposals-bot.mjs
//
// Variáveis (padrões entre parênteses): BACKEND_BIN, DATABASE_URL
// (postgres://concord-user:concord-password@127.0.0.1:5432/concord_e2e_kanban),
// PG_CONTAINER (concord-postgres), PG_USER (concord-user), PG_DB (concord_e2e_kanban).
// O teste espera um Tick do servidor (1 min) para ver o limite da API passar.
import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtempSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createApi } from './lib/e2e.mjs'

const root = resolve(import.meta.dirname, '..')
const BACKEND_BIN = resolve(process.env.BACKEND_BIN ?? '')
assert(process.env.BACKEND_BIN && existsSync(BACKEND_BIN), 'defina BACKEND_BIN (go build -o … ./cmd)')
const PG_CONTAINER = process.env.PG_CONTAINER ?? 'concord-postgres'
const PG_USER = process.env.PG_USER ?? 'concord-user'
const PG_DB = process.env.PG_DB ?? 'concord_e2e_kanban'
const DATABASE_URL =
  process.env.DATABASE_URL ??
  `postgres://concord-user:concord-password@127.0.0.1:5432/${PG_DB}?sslmode=disable`
const PORT = 18080
const API = `http://127.0.0.1:${PORT}/api`
const BOT_ID = '53414c49-4e48-4100-8000-000000000002'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function sql(query) {
  return execFileSync('docker', ['exec', PG_CONTAINER, 'psql', '-U', PG_USER, '-d', PG_DB, '-tAc', query], {
    encoding: 'utf8'
  }).trim()
}

// ── GitHub falso ─────────────────────────────────────────────────────────────
const gh = { created: [], patches: [], limitedUntil: 0, nextNumber: 1 }
const fakeGitHub = createServer((req, res) => {
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    const now = Math.floor(Date.now() / 1000)
    if (gh.limitedUntil > now) {
      res.writeHead(403, {
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(gh.limitedUntil),
        'content-type': 'application/json'
      })
      res.end('{"message":"API rate limit exceeded"}')
      gh.refused = (gh.refused ?? 0) + 1
      return
    }
    const payload = body ? JSON.parse(body) : {}
    if (req.method === 'POST' && req.url === '/repos/o/r/issues') {
      const number = gh.nextNumber++
      gh.created.push({ number, title: payload.title })
      res.writeHead(201, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ number, html_url: `https://github.com/o/r/issues/${number}` }))
      return
    }
    const m = /^\/repos\/o\/r\/issues\/(\d+)$/.exec(req.url ?? '')
    if (req.method === 'PATCH' && m) {
      gh.patches.push({ number: Number(m[1]), ...payload })
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end('{}')
      return
    }
    res.writeHead(404)
    res.end()
  })
})
await new Promise((r) => fakeGitHub.listen(0, '127.0.0.1', r))
const GH_URL = `http://127.0.0.1:${fakeGitHub.address().port}`

// ── Backend ──────────────────────────────────────────────────────────────────
const work = mkdtempSync(join(tmpdir(), 'salinha-e2e-kanban-'))
let backend = null
async function startBackend(techIds = '') {
  backend = spawn(BACKEND_BIN, [], {
    cwd: work, // sem .env do repositório
    stdio: ['ignore', 'ignore', 'pipe'],
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: '127.0.0.1',
      DATABASE_URL,
      JWT_SECRET: 'e2e-'.repeat(12),
      LIVEKIT_API_KEY: 'k',
      LIVEKIT_API_SECRET: 's'.repeat(40),
      MIGRATIONS_DIR: join(root, 'backend', 'migrations'),
      UPDATES_DIR: join(work, 'updates'),
      UPLOADS_DIR: join(work, 'uploads'),
      GITHUB_REPO: 'o/r',
      GITHUB_TOKEN: 'tok',
      GITHUB_API_URL: GH_URL,
      TECH_TEAM_USER_IDS: techIds
    }
  })
  let log = ''
  backend.stderr.on('data', (c) => (log = (log + c).slice(-4000)))
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${PORT}/healthz`)).ok) return
    } catch {
      // ainda subindo
    }
    await sleep(500)
  }
  throw new Error(`backend não subiu:\n${log}`)
}
async function stopBackend() {
  if (!backend) return
  backend.kill()
  await new Promise((r) => backend.once('exit', r))
  backend = null
}

const { request } = createApi(API)
async function api(path, { expect = [200, 201], ...opts } = {}) {
  const res = await request(path, opts)
  assert(expect.includes(res.status), `${opts.method ?? 'GET'} ${path}: ${res.status} ${res.text}`)
  return { status: res.status, data: res.body }
}

const run = Date.now().toString(36)
async function register(prefix) {
  const { data } = await api('/auth/register', {
    method: 'POST',
    body: {
      username: `${prefix}${run}`,
      display_name: prefix,
      email: `${prefix}${run}@e2e.test`,
      password: 'Senha-forte-e2e-123'
    }
  })
  const me = (await api('/users/me', { token: data.access_token })).data
  return { id: me.id, name: prefix }
}
async function login(user) {
  const { data } = await api('/auth/login', {
    method: 'POST',
    body: { login: `${user.name}${run}`, password: 'Senha-forte-e2e-123' }
  })
  return data.access_token
}

/** Mensagens do Salinha Bot na DM do usuário. */
async function botMessages(token) {
  const convs = (await api('/conversations', { token })).data
  const list = Array.isArray(convs) ? convs : (convs.conversations ?? [])
  const dm = list.find((c) => c.other_user?.id === BOT_ID)
  if (!dm) return { dm: null, messages: [] }
  const msgs = (await api(`/conversations/${dm.id}/messages`, { token })).data
  const messages = Array.isArray(msgs) ? msgs : (msgs.messages ?? [])
  return { dm, messages: messages.filter((m) => m.author_id === BOT_ID).map((m) => m.content) }
}

async function waitFor(label, fn, timeoutMs) {
  const start = Date.now()
  for (;;) {
    const value = await fn()
    if (value) return value
    if (Date.now() - start > timeoutMs) throw new Error(`timeout esperando: ${label}`)
    await sleep(1000)
  }
}

try {
  // 1. Usuários (o time tech só vale depois de reiniciar com os ids).
  await startBackend()
  const author = await register('autor')
  const tech1 = await register('devum')
  const tech2 = await register('devdois')
  sql(`UPDATE users SET email_verified_at = NOW() WHERE id IN ('${author.id}','${tech1.id}','${tech2.id}')`)
  await stopBackend()
  await startBackend(`${tech1.id},${tech2.id}`)
  const [tAuthor, tTech1, tTech2] = await Promise.all([login(author), login(tech1), login(tech2)])

  // 2. Proposta → aprovada pelo time: issue criada e aviso do bot.
  const p = (await api('/proposals', {
    token: tAuthor,
    method: 'POST',
    body: { title: 'Tema rosa', description: 'Um tema rosa', image_ids: [] }
  })).data
  await api(`/proposals/${p.id}/status`, { token: tTech1, method: 'PATCH', body: { status: 'proposed' } })
  assert.equal(gh.created.length, 1, 'a issue deveria ser criada ao aprovar')
  let bot = await botMessages(tAuthor)
  assert(bot.messages.some((m) => m.includes('“Tema rosa”') && m.includes('aprovada pelo time')), `aviso de aprovação: ${bot.messages}`)
  console.log('✓ aprovada: issue criada e o Salinha Bot avisou na DM')

  // 3. Dev com GitHub pega o card: responsável + assignee na issue.
  await api('/proposals/github-username', { token: tTech1, method: 'PUT', body: { username: 'dev-um' } })
  let moved = (await api(`/proposals/${p.id}/status`, { token: tTech1, method: 'PATCH', body: { status: 'in_progress' } })).data
  assert.equal(moved.assignee?.id, tech1.id)
  let last = gh.patches.at(-1)
  assert.deepEqual([last.state, last.assignees], ['open', ['dev-um']], `PATCH do assignee: ${JSON.stringify(last)}`)
  console.log('✓ em andamento: card com o dev e assignee na issue')

  // 4. Outro dev conclui (deploy): o responsável fica e a issue fecha.
  moved = (await api(`/proposals/${p.id}/status`, { token: tTech2, method: 'PATCH', body: { status: 'done' } })).data
  assert.equal(moved.assignee?.id, tech1.id, 'Concluída mantém quem estava')
  last = gh.patches.at(-1)
  assert.deepEqual([last.state, last.state_reason], ['closed', 'completed'])
  bot = await botMessages(tAuthor)
  assert(bot.messages.some((m) => m.includes('concluída') && m.includes('github.com/o/r/issues/1')), `aviso de concluída: ${bot.messages}`)
  console.log('✓ concluída por outro dev: responsável mantido, issue fechada, aviso com o link')

  // 5. Tirar de Concluída sendo outro dev: 409 com o nome; com take_over troca e reabre.
  const conflict = await api(`/proposals/${p.id}/status`, {
    token: tTech2, method: 'PATCH', body: { status: 'proposed' }, expect: [409]
  })
  assert.equal(conflict.data.code, 'assignee_conflict')
  assert.equal(conflict.data.assignee_name, tech1.name)
  moved = (await api(`/proposals/${p.id}/status`, {
    token: tTech2, method: 'PATCH', body: { status: 'proposed', take_over: true }
  })).data
  assert.equal(moved.assignee?.id, tech2.id)
  last = gh.patches.at(-1)
  assert.deepEqual([last.state, last.assignees], ['open', []], `reabrir sem o assignee antigo: ${JSON.stringify(last)}`)
  console.log('✓ tirar de outro dev pede confirmação (409) e, confirmado, troca e reabre a issue')

  // 6. A DM do bot é só leitura.
  const dmId = bot.dm.id
  const refused = await api(`/conversations/${dmId}/messages`, {
    token: tAuthor, method: 'POST', body: { content: 'oi bot' }, expect: [403]
  })
  assert.equal(refused.data.code, 'bot_conversation')
  const anyMsg = (await api(`/conversations/${dmId}/messages`, { token: tAuthor })).data
  const firstId = (Array.isArray(anyMsg) ? anyMsg : anyMsg.messages)[0].id
  const react = await api(`/conversations/${dmId}/messages/${firstId}/reactions`, {
    token: tAuthor, method: 'POST', body: { emoji: '👍' }, expect: [403]
  })
  assert.equal(react.data.code, 'bot_conversation')
  console.log('✓ DM do Salinha Bot: responder e reagir dão 403')

  // 7. Limite da API: o card move; a issue espera o reset e o próximo Tick aplica.
  gh.limitedUntil = Math.floor(Date.now() / 1000) + 5
  const before = gh.patches.length
  await api(`/proposals/${p.id}/status`, { token: tTech2, method: 'PATCH', body: { status: 'rejected' } })
  assert.equal(gh.patches.length, before, 'com o limite esgotado nada pode ser aplicado')
  assert((gh.refused ?? 0) >= 1, 'a chamada deveria ter batido no limite')
  const refusedAt = gh.refused
  console.log('  …limite da API: esperando o reset e o próximo ciclo (até ~70 s)')
  await waitFor('issue fechada depois do reset', () => {
    const p2 = gh.patches.at(-1)
    return gh.patches.length > before && p2.state === 'closed' && p2.state_reason === 'not_planned'
  }, 75_000)
  assert.equal(gh.refused, refusedAt, 'antes do reset o servidor não pode chamar de novo')
  console.log('✓ limite da API: o card moveu na hora e a issue fechou sozinha depois do reset')

  console.log('\nE2E das propostas com o Salinha Bot: tudo certo.')
} finally {
  await stopBackend()
  fakeGitHub.close()
}
