// E2E dos cargos em tempo real (sem navegador): canais privados não vazam pelo
// WebSocket e as salas são revalidadas quando os cargos mudam; expulsar avisa o
// expulso. Roda contra um backend ligado — use um banco descartável, pois cria
// usuários e um servidor de teste.
// Uso (Node 22+):
//   API=http://localhost:8080/api WS=ws://localhost:8080/ws BACKEND_LOG=<saída do backend> node scripts/e2e-roles-ws.mjs
import { createE2E } from './lib/e2e.mjs'

const BASE = process.env.API ?? 'http://localhost:8080/api'
const WS = process.env.WS ?? 'ws://localhost:8080/ws'
const tag = Math.random().toString(16).slice(2, 8)
const failures = []
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'OK  ' : 'FAIL'} ${name}${cond ? '' : '  ' + extra}`)
  if (!cond) failures.push(name)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const e2e = createE2E({ api: BASE, run: tag })
// (método, caminho, token, corpo) → { status, body }, sem lançar.
const api = (method, path, token, body) => e2e.request(path, { method, token, body })
const user = e2e.makeUser

function connect(u) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS}?token=${u.token}`)
    const client = { ws, events: [], mark: () => client.events.length }
    ws.onmessage = (e) => {
      try { client.events.push(JSON.parse(e.data)) } catch { /* ignora */ }
    }
    ws.onopen = () => resolve(client)
    ws.onerror = (e) => reject(new Error('ws error ' + (e.message ?? '')))
    client.subscribe = (room) => ws.send(JSON.stringify({ type: 'subscribe', payload: { room } }))
    client.since = (mark, ...types) =>
      client.events.slice(mark).filter((ev) => types.includes(ev.type))
  })
}

const [dono, ana, vip] = await Promise.all([user('dono'), user('ana'), user('vip')])

const { body: srv } = await api('POST', '/servers', dono.token, { name: 'WS Teste' })
const sid = srv.id
const { body: code } = await api('GET', `/servers/${sid}/invite-code`, dono.token)
for (const u of [ana, vip]) await api('POST', '/invites/join', u.token, { code: code.code })
const { body: role } = await api('POST', `/servers/${sid}/roles`, dono.token, { name: 'VIP' })
await api('PUT', `/servers/${sid}/members/${vip.id}/roles/${role.id}`, dono.token)
const { body: priv } = await api('POST', `/servers/${sid}/channels`, dono.token, {
  name: 'segredo', private: true, role_ids: [role.id]
})
const { body: chans } = await api('GET', `/servers/${sid}/channels`, dono.token)
const aberto = chans.find((c) => c.name === 'geral')

const wsDono = await connect(dono)
const wsAna = await connect(ana)
const wsVip = await connect(vip)
for (const c of [wsDono, wsAna, wsVip]) c.subscribe(`server:${sid}`)
// O app assina a sala pessoal ao conectar (ws.ts).
wsDono.subscribe(`user:${dono.id}`)
wsAna.subscribe(`user:${ana.id}`)
wsVip.subscribe(`user:${vip.id}`)
wsAna.subscribe(`channel:${priv.id}`) // deve ser recusado
wsVip.subscribe(`channel:${priv.id}`)
wsDono.subscribe(`channel:${priv.id}`)
wsAna.subscribe(`channel:${aberto.id}`)
await sleep(700)

// --- mensagem no canal privado
let m = [wsAna.mark(), wsVip.mark(), wsDono.mark()]
await api('POST', `/channels/${priv.id}/messages`, vip.token, { content: 'segredo' })
await sleep(700)
check('vip recebe a mensagem do canal privado', wsVip.since(m[1], 'message:create').length >= 1)
check('dono recebe a mensagem do canal privado', wsDono.since(m[2], 'message:create').length >= 1)
check('ana NÃO recebe a mensagem do canal privado', wsAna.since(m[0], 'message:create').length === 0,
  JSON.stringify(wsAna.since(m[0], 'message:create')))

// --- mensagem no canal público chega para todos
m = [wsAna.mark(), wsVip.mark(), wsDono.mark()]
await api('POST', `/channels/${aberto.id}/messages`, dono.token, { content: 'olá' })
await sleep(700)
check('ana recebe a mensagem do canal público', wsAna.since(m[0], 'message:create').length >= 1)
check('vip recebe a mensagem do canal público', wsVip.since(m[1], 'message:create').length >= 1)

// --- canal novo privado não aparece para a ana
m = [wsAna.mark(), wsVip.mark()]
await api('POST', `/servers/${sid}/channels`, dono.token, { name: 'outro-segredo', private: true, role_ids: [role.id] })
await sleep(700)
check('vip recebe channel:create do canal privado novo', wsVip.since(m[1], 'channel:create').length === 1)
check('ana NÃO recebe channel:create do canal privado novo', wsAna.since(m[0], 'channel:create').length === 0)

// --- eventos de cargo chegam a todos os membros
m = [wsAna.mark(), wsVip.mark()]
await api('POST', `/servers/${sid}/roles`, dono.token, { name: 'Artistas', color: 255 })
await sleep(700)
check('ana recebe role:create', wsAna.since(m[0], 'role:create').length === 1)
check('vip recebe role:create', wsVip.since(m[1], 'role:create').length === 1)

// --- tirar o cargo revoga o acesso em tempo real
m = [wsAna.mark(), wsVip.mark()]
await api('DELETE', `/servers/${sid}/members/${vip.id}/roles/${role.id}`, dono.token)
await sleep(900)
check('vip recebe server:member:roles', wsVip.since(m[1], 'server:member:roles').length === 1)
check('vip recebe server:permissions:invalidate', wsVip.since(m[1], 'server:permissions:invalidate').length >= 1)
m = [wsAna.mark(), wsVip.mark(), wsDono.mark()]
await api('POST', `/channels/${priv.id}/messages`, dono.token, { content: 'só o dono agora' })
await sleep(700)
check('vip, sem o cargo, não recebe mais o canal privado', wsVip.since(m[1], 'message:create').length === 0,
  JSON.stringify(wsVip.since(m[1], 'message:create')))
check('dono continua recebendo', wsDono.since(m[2], 'message:create').length >= 1)
const { status: vipRead } = await api('GET', `/channels/${priv.id}/messages`, vip.token)
check('vip, sem o cargo, não lê o canal por HTTP', vipRead === 404, vipRead)

// --- expulsão avisa o expulso e some da sala
m = [wsAna.mark(), wsVip.mark()]
await api('DELETE', `/servers/${sid}/members/${ana.id}`, dono.token)
await sleep(900)
const removed = wsAna.since(m[0], 'server:removed')
check('ana recebe server:removed (kick)', removed.length === 1 && removed[0].payload.reason === 'kick', JSON.stringify(removed))
check('vip vê a ana sair (server:member:leave)', wsVip.since(m[1], 'server:member:leave').length === 1)
m = [wsAna.mark()]
await api('POST', `/channels/${aberto.id}/messages`, dono.token, { content: 'ana já saiu' })
await sleep(700)
check('ana expulsa não recebe mais nada do servidor', wsAna.since(m[0], 'message:create').length === 0)

for (const c of [wsDono, wsAna, wsVip]) c.ws.close()
console.log()
console.log(failures.length ? 'FALHAS: ' + failures.join(' | ') : 'TUDO OK')
process.exit(failures.length ? 1 : 0)
