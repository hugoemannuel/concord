// E2E de "Em atividade" (jogo em andamento) sem navegador: quem recebe o
// presence:activity (próprio, amigo, servidor em comum, estranho), carga
// inicial, validação, limite de troca, invisível, limpar e desconectar. Roda
// contra um backend ligado — use um banco descartável, pois cria usuários.
// Uso (Node 22+):
//   API=http://localhost:8080/api WS=ws://localhost:8080/ws BACKEND_LOG=<saída do backend> node scripts/e2e-atividade.mjs
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
    const client = { ws, events: [] }
    ws.onmessage = (e) => {
      try { client.events.push(JSON.parse(e.data)) } catch { /* ignora */ }
    }
    ws.onopen = () => {
      // O app assina a sala pessoal ao conectar (ws.ts).
      ws.send(JSON.stringify({ type: 'subscribe', payload: { room: `user:${u.id}` } }))
      resolve(client)
    }
    ws.onerror = (e) => reject(new Error('ws error ' + (e.message ?? '')))
    client.send = (type, payload) => ws.send(JSON.stringify({ type, payload }))
    client.mark = () => client.events.length
    // presence:activity de `userId` desde a marca.
    client.activity = (mark, userId) =>
      client.events.slice(mark).filter((ev) => ev.type === 'presence:activity' && ev.payload.user_id === userId)
  })
}

const [ana, bia, cris, dan] = await Promise.all([user('ana'), user('bia'), user('cris'), user('dan')])

// ana e bia são amigas; ana e dan dividem um servidor; cris é estranha.
await api('POST', '/friends/request', ana.token, { username: bia.username })
await api('PUT', `/friends/${ana.username}/accept`, bia.token)
const { body: srv } = await api('POST', '/servers', ana.token, { name: 'Atividade Teste' })
const { body: code } = await api('GET', `/servers/${srv.id}/invite-code`, ana.token)
await api('POST', '/invites/join', dan.token, { code: code.code })

const wsAna = await connect(ana)
const wsBia = await connect(bia)
const wsCris = await connect(cris)
const wsDan = await connect(dan)
await sleep(500)

const fetchActivities = async (viewer, ids) => (await api('GET', `/presence/activities?ids=${ids.join(',')}`, viewer.token)).body

// 1. Jogo novo chega a ela, à amiga e ao membro do servidor; não à estranha.
let m = { ana: wsAna.mark(), bia: wsBia.mark(), cris: wsCris.mark(), dan: wsDan.mark() }
wsAna.send('activity:set', { name: 'VALORANT', kind: 'game', started_at: Date.now() - 5 * 60_000 })
await sleep(600)
const got = (c, mk) => c.activity(mk, ana.id)
check('ana recebe o próprio jogo', got(wsAna, m.ana).at(-1)?.payload.activity?.name === 'VALORANT')
check('amiga recebe o jogo', got(wsBia, m.bia).at(-1)?.payload.activity?.name === 'VALORANT')
check('membro do servidor recebe o jogo', got(wsDan, m.dan).at(-1)?.payload.activity?.name === 'VALORANT')
check('estranha NÃO recebe', got(wsCris, m.cris).length === 0, JSON.stringify(got(wsCris, m.cris)))
check('início vem do cliente (≈5 min atrás)', Date.now() - got(wsBia, m.bia).at(-1)?.payload.activity?.started_at > 4 * 60_000)

// 2. Carga inicial respeita a visibilidade.
check('amiga vê na carga inicial', (await fetchActivities(bia, [ana.id]))?.[ana.id]?.name === 'VALORANT')
check('membro vê na carga inicial', (await fetchActivities(dan, [ana.id]))?.[ana.id]?.name === 'VALORANT')
check('estranha não vê na carga inicial', Object.keys((await fetchActivities(cris, [ana.id])) ?? {}).length === 0)

// 3. Troca imediata é limitada; depois de 1,1 s vale.
m.bia = wsBia.mark()
wsAna.send('activity:set', { name: 'PUBG: BATTLEGROUNDS', kind: 'game' })
await sleep(400)
check('troca em menos de 1 s é ignorada', got(wsBia, m.bia).length === 0)
await sleep(800)
wsAna.send('activity:set', { name: 'PUBG: BATTLEGROUNDS', kind: 'game' })
await sleep(500)
check('troca depois do intervalo chega', got(wsBia, m.bia).at(-1)?.payload.activity?.name === 'PUBG: BATTLEGROUNDS')

// 4. Entradas inválidas não publicam nada.
await sleep(1100)
m.bia = wsBia.mark()
wsAna.send('activity:set', { name: '', kind: 'game' })
wsAna.send('activity:set', { name: 'X', kind: 'hack' })
wsAna.send('activity:set', { name: 'x'.repeat(100), kind: 'game' })
await sleep(500)
check('entrada inválida é ignorada', got(wsBia, m.bia).length === 0)

// 5. Invisível esconde; voltar online mostra de novo.
m.bia = wsBia.mark()
await api('PUT', '/users/me/status', ana.token, { status: 'invisible' })
await sleep(600)
check('invisível: amiga recebe "parou"', got(wsBia, m.bia).at(-1)?.payload.activity === null)
check('invisível: some da carga inicial', Object.keys((await fetchActivities(bia, [ana.id])) ?? {}).length === 0)
m.bia = wsBia.mark()
await api('PUT', '/users/me/status', ana.token, { status: 'online' })
await sleep(600)
check('voltou online: jogo reaparece', got(wsBia, m.bia).at(-1)?.payload.activity?.name === 'PUBG: BATTLEGROUNDS')

// 6. Limpar.
m.bia = wsBia.mark()
wsAna.send('activity:clear', {})
await sleep(500)
check('activity:clear avisa a amiga', got(wsBia, m.bia).at(-1)?.payload.activity === null)

// 7. Fechar o jogo e cair a conexão limpa sozinho.
await sleep(1100)
wsAna.send('activity:set', { name: 'Counter-Strike 2', kind: 'game' })
await sleep(500)
m.bia = wsBia.mark()
wsAna.ws.close()
await sleep(800)
check('desconectar limpa a atividade', got(wsBia, m.bia).at(-1)?.payload.activity === null)
check('desconectada: some da carga inicial', Object.keys((await fetchActivities(bia, [ana.id])) ?? {}).length === 0)

for (const c of [wsBia, wsCris, wsDan]) c.ws.close()
console.log(failures.length ? `\n${failures.length} falha(s)` : '\ntudo certo')
process.exit(failures.length ? 1 : 0)
