// E2E das mensagens temporárias e da visualização única, só pela API (sem
// navegador nem LiveKit). Prova as regras do servidor de ponta a ponta: o modo
// da conversa, a mensagem que vence e some (filtro + limpeza periódica), e a
// foto que cada destinatário abre uma vez só.
//
// Uso: backend rodando sem SMTP (o e-mail de confirmação sai no log) e um psql
// no mesmo banco (para "envelhecer" linhas sem esperar 24 h):
//   API=http://127.0.0.1:18091/api BACKEND_LOG=/tmp/backend.log \
//   E2E_PSQL="docker exec -i concord-postgres psql -U concord-user -d <banco> -tA" \
//   UPLOADS_DIR=<pasta de uploads do backend> node scripts/e2e-mensagens-temporarias.mjs
// A limpeza roda a cada minuto: o script leva uns 3 minutos.
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { createE2E } from './lib/e2e.mjs'

const API = process.env.API ?? 'http://127.0.0.1:18091/api'
const PSQL = process.env.E2E_PSQL
const UPLOADS_DIR = process.env.UPLOADS_DIR
if (!PSQL) {
  console.error('defina E2E_PSQL (ver o cabeçalho)')
  process.exit(2)
}
const run = Date.now().toString(36)
const { api, request, makeUser } = createE2E({ api: API, run })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let failures = 0
function check(desc, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${desc}${detail === undefined ? '' : ': ' + JSON.stringify(detail)}`)
  if (!ok) failures++
}

function sql(query) {
  return execSync(PSQL, { input: query, encoding: 'utf8' }).trim()
}

async function waitFor(desc, fn, ok, timeoutMs = 90000) {
  const start = Date.now()
  let last
  while (Date.now() - start < timeoutMs) {
    last = await fn()
    if (ok(last)) return check(desc, true)
    await sleep(2000)
  }
  check(desc, false, last)
}

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
)

async function upload(token, conversationId) {
  const form = new FormData()
  form.append('file', new Blob([PNG], { type: 'image/png' }), 'foto.png')
  const res = await fetch(`${API}/conversations/${conversationId}/attachments`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form
  })
  if (!res.ok) throw new Error(`upload: ${res.status} ${await res.text()}`)
  return res.json()
}

async function fetchFile(id, token, range) {
  const res = await fetch(`${API}/media/${id}?token=${encodeURIComponent(token)}`, {
    headers: range ? { Range: range } : {}
  })
  return { status: res.status, bytes: Buffer.from(await res.arrayBuffer()) }
}

const messages = async (user, convId) => api(`/conversations/${convId}/messages`, { token: user.token })
const send = (user, convId, body) =>
  request(`/conversations/${convId}/messages`, { token: user.token, method: 'POST', body })

async function befriend(a, b) {
  await api('/friends/request', { token: a.token, method: 'POST', body: { username: b.username } })
  await api(`/friends/${a.username}/accept`, { token: b.token, method: 'PUT' })
}

// ─── Preparação ─────────────────────────────────────────────────────────────
const [ana, bia, caio, davi] = [await makeUser('ana'), await makeUser('bia'), await makeUser('caio'), await makeUser('davi')]
for (const other of [bia, caio, davi]) await befriend(ana, other)
const dm = await api(`/conversations/with/${bia.id}`, { token: ana.token })
console.log('setup ok', { dm: dm.id })

// ─── Mensagens temporárias ─────────────────────────────────────────────────
const put = (user, seconds) =>
  request(`/conversations/${dm.id}/disappearing`, { token: user.token, method: 'PUT', body: { seconds } })

check('prazo inválido (3600) dá 400', (await put(ana, 3600)).status === 400)
check('quem não participa dá 403', (await put(davi, 86400)).status === 403)
check('ligar 24 h dá 204', (await put(ana, 86400)).status === 204)

const conv = (await api('/conversations', { token: bia.token })).find((c) => c.id === dm.id)
check('a conversa traz disappearing_seconds = 86400 para o outro lado', conv?.disappearing_seconds === 86400, conv?.disappearing_seconds)

const notice = (await messages(bia, dm.id)).find((m) => m.system_kind === 'disappearing')
check(
  'aviso de sistema com o texto aprovado',
  notice?.content === 'ana ativou as mensagens temporárias. Novas mensagens vão sumir após 24 horas.',
  notice?.content
)
check('o aviso não expira', notice && !notice.expires_at, notice?.expires_at)

const sent = await send(ana, dm.id, { content: 'some em 24h' })
const ttl = new Date(sent.body.expires_at) - new Date(sent.body.created_at)
check('mensagem nova sai com expires_at ≈ envio + 24 h', Math.abs(ttl - 86400000) < 5000, ttl)

sql(`UPDATE messages SET expires_at = now() - interval '1 minute' WHERE id = '${sent.body.id}';`)
check('vencida some da lista na hora (antes da limpeza)', !(await messages(bia, dm.id)).some((m) => m.id === sent.body.id))
const preview = (await api('/conversations', { token: bia.token })).find((c) => c.id === dm.id)?.last_message
check('vencida não é a prévia da DM', preview?.id !== sent.body.id, preview)
await waitFor(
  'a limpeza apaga a vencida do banco (até ~1 min)',
  () => sql(`SELECT count(*) FROM messages WHERE id = '${sent.body.id}';`),
  (n) => n === '0'
)

check('desligar dá 204', (await put(bia, null)).status === 204)
const after = await send(ana, dm.id, { content: 'fica' })
check('com o modo desligado a mensagem não expira', !after.body.expires_at, after.body.expires_at)

// ─── Visualização única ────────────────────────────────────────────────────
const group = await api('/conversations/group', { token: ana.token, method: 'POST', body: { user_ids: [bia.id, caio.id] } })
const att = await upload(ana.token, group.id)
const vo = await send(ana, group.id, { content: '', attachment_ids: [att.id], view_once: true })
check('envio com view_once dá 201', vo.status === 201, vo.status)
const media = vo.body.view_once
check('a mensagem vem com view_once (image) e sem o anexo em attachments', media?.kind === 'image' && !(vo.body.attachments ?? []).length, vo.body)
check(
  'recipient_ids = participantes na hora do envio, sem o autor',
  JSON.stringify([...(media?.recipient_ids ?? [])].sort()) === JSON.stringify([bia.id, caio.id].sort()),
  media?.recipient_ids
)

const two = [await upload(ana.token, group.id), await upload(ana.token, group.id)]
check('view_once com 2 anexos dá 400', (await send(ana, group.id, { content: '', attachment_ids: two.map((a) => a.id), view_once: true })).status === 400)

const mediaToken = (await api('/media/token', { token: bia.token })).token
check('token de mídia comum não abre o arquivo (404)', (await fetchFile(att.id, mediaToken)).status === 404)

const open = (user) => request(`/attachments/${att.id}/open`, { token: user.token, method: 'POST' })
check('o autor não abre (403)', (await open(ana)).status === 403)

await api(`/conversations/${group.id}/members`, { token: ana.token, method: 'POST', body: { user_ids: [davi.id] } })
check('quem entrou depois do envio não abre (403)', (await open(davi)).status === 403)
const daviView = (await messages(davi, group.id)).find((m) => m.id === vo.body.id)?.view_once
check('para quem entrou depois o payload diz que não é destinatário', daviView && !daviView.recipient_ids.includes(davi.id))

const biaOpen = await open(bia)
check('destinatário abre (200 com token)', biaOpen.status === 200 && !!biaOpen.body?.token, biaOpen.status)
const file = await fetchFile(att.id, biaOpen.body.token)
check('o token da visualização entrega o arquivo', file.status === 200 && file.bytes.equals(PNG), file.status)
check('Range funciona (206)', (await fetchFile(att.id, biaOpen.body.token, 'bytes=0-3')).status === 206)
check('segunda abertura dá 410', (await open(bia)).status === 410)

const [c1, c2] = await Promise.all([open(caio), open(caio)])
check('duas aberturas ao mesmo tempo: só uma ganha', [c1.status, c2.status].sort().join() === '200,410', [c1.status, c2.status])

const seen = (await messages(ana, group.id)).find((m) => m.id === vo.body.id)?.view_once
check('o autor vê os dois em viewer_ids', seen?.viewer_ids?.length === 2 && !seen.gone, seen)

const fwd = await request(`/conversations/${group.id}/messages/${vo.body.id}/forward`, {
  token: bia.token,
  method: 'POST',
  body: { conversation_id: dm.id }
})
check('encaminhar a visualização única é recusado', fwd.status >= 400, fwd.status)

const groupPreview = (await api('/conversations', { token: caio.token })).find((c) => c.id === group.id)?.last_message
check('prévia da conversa usa o rótulo', groupPreview?.content?.includes('Foto de visualização única'), groupPreview?.content)

// Todos viram: a limpeza só apaga depois da janela de 5 min do token.
check('logo depois de todos verem o arquivo continua no disco', !UPLOADS_DIR || existsSync(join(UPLOADS_DIR, att.id)))
sql(`UPDATE attachment_views SET viewed_at = now() - interval '6 minutes' WHERE attachment_id = '${att.id}';`)
await waitFor(
  'a limpeza marca a foto como expirada depois da janela',
  async () => (await messages(ana, group.id)).find((m) => m.id === vo.body.id)?.view_once?.gone,
  (gone) => gone === true
)
check('o token não serve mais (404)', (await fetchFile(att.id, biaOpen.body.token)).status === 404)
if (UPLOADS_DIR) check('o arquivo saiu do disco', !existsSync(join(UPLOADS_DIR, att.id)))

console.log(failures ? `\n${failures} falha(s)` : '\ntudo PASS')
process.exit(failures ? 1 : 0)
