// E2E da mídia no chat: upload, quem abre o arquivo, limites, anexo de outra
// pessoa/sala, DM com áudio, tempo real no navegador e apagar a mensagem.
// Uso: igual ao scripts/e2e-invite.mjs (backend rodando + renderer buildado com
// VITE_SERVER_URL e servido em APP). UPLOADS_DIR é a pasta de mídia do backend
// (padrão backend/uploads, o padrão de `go run ./cmd` dentro de backend/).
//   API=http://localhost:8080/api APP=http://localhost:5174/ BACKEND_LOG=<saída do backend> node scripts/e2e-media.mjs
import { createRequire } from 'module'
import { existsSync } from 'fs'
import { join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { createE2E } from './lib/e2e.mjs'
const require = createRequire(new URL('../frontend/package.json', import.meta.url))
const { chromium } = require('playwright')

const API = process.env.API ?? 'http://localhost:8080/api'
const APP = process.env.APP ?? 'http://localhost:5174/'
const UPLOADS_DIR = resolve(
  process.env.UPLOADS_DIR ?? join(fileURLToPath(new URL('..', import.meta.url)), 'backend', 'uploads')
)
const run = Date.now().toString(36)
const { request: api, makeUser } = createE2E({ api: API, run })

// PNG 1×1 válido e um "ogg" (só a assinatura importa para o backend).
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
)
const OGG = Buffer.concat([Buffer.from('OggS\x00\x02'), Buffer.alloc(200)])

async function upload(token, roomPath, name, type, bytes, fields = {}) {
  const form = new FormData()
  for (const [k, v] of Object.entries(fields)) form.append(k, String(v))
  form.append('file', new Blob([bytes], { type }), name)
  try {
    const res = await fetch(`${API}${roomPath}/attachments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form
    })
    const text = await res.text()
    return { status: res.status, body: text ? JSON.parse(text) : null }
  } catch (err) {
    // O servidor pode fechar a conexão antes de ler um corpo grande demais.
    return { status: 0, body: String(err.cause?.code ?? err.message) }
  }
}

async function fetchFile(id, mediaToken) {
  const query = mediaToken === undefined ? '' : `?token=${encodeURIComponent(mediaToken)}`
  const res = await fetch(`${API}/media/${id}${query}`)
  const bytes = Buffer.from(await res.arrayBuffer())
  return { status: res.status, type: res.headers.get('content-type'), bytes }
}

const mediaToken = async (user) => (await api('/media/token', { token: user.token })).body.token

function check(desc, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${desc}${detail === undefined ? '' : ': ' + JSON.stringify(detail)}`)
  if (!ok) process.exitCode = 1
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let browser
try {
  // 1. Ana cria o servidor; Bia entra pelo código; Carla fica de fora.
  const ana = await makeUser('ana')
  const bia = await makeUser('bia')
  const carla = await makeUser('carla')
  const server = (await api('/servers', { token: ana.token, method: 'POST', body: { name: `Midia ${run}` } })).body
  const serverId = server.id ?? server.server?.id
  const code = (await api(`/servers/${serverId}/invite-code`, { token: ana.token })).body.code
  const joined = await api('/invites/join', { token: bia.token, method: 'POST', body: { code } })
  check('bia entra no servidor pelo código', joined.status === 200, joined.status)
  const channels = (await api(`/servers/${serverId}/channels`, { token: ana.token })).body
  const channel = channels.find((c) => (c.type ?? 'text') === 'text')
  const channelPath = `/channels/${channel.id}`
  check('servidor tem canal de texto', Boolean(channel), channel?.name)

  // 2. Ana sobe o PNG e manda mensagem só com o anexo.
  const png = await upload(ana.token, channelPath, 'foto.png', 'image/png', PNG, { width: 1, height: 1 })
  check('upload de PNG vira anexo de imagem', png.status === 201 && png.body.kind === 'image', png)
  const msg = await api(`${channelPath}/messages`, {
    token: ana.token,
    method: 'POST',
    body: { content: '', attachment_ids: [png.body.id] }
  })
  check('mensagem sem texto, só com anexo', msg.status === 201 && msg.body.attachments?.length === 1, msg.status)
  check('arquivo foi para o disco', existsSync(join(UPLOADS_DIR, png.body.id)), UPLOADS_DIR)

  // 3. Bia (membro) abre o arquivo.
  const biaMedia = await mediaToken(bia)
  const seen = await fetchFile(png.body.id, biaMedia)
  check('bia abre a imagem', seen.status === 200 && seen.type === 'image/png' && seen.bytes.equals(PNG), seen.status)

  // 4. Quem não tem acesso não abre.
  check('carla (de fora) recebe 404', (await fetchFile(png.body.id, await mediaToken(carla))).status === 404)
  check('sem token recebe 401', (await fetchFile(png.body.id)).status === 401)
  check('access token no lugar do de mídia recebe 401', (await fetchFile(png.body.id, bia.token)).status === 401)
  const carlaUpload = await upload(carla.token, channelPath, 'x.png', 'image/png', PNG)
  check('carla não sobe arquivo no canal', carlaUpload.status === 403, carlaUpload.status)

  // 5. Mais de 25 MB.
  const big = Buffer.alloc(30 * 1024 * 1024)
  PNG.copy(big)
  const tooBig = await upload(ana.token, channelPath, 'grande.png', 'image/png', big)
  check('arquivo de 30 MB é recusado (413)', tooBig.status === 413, tooBig.status)

  // 6. HTML disfarçado de PNG.
  const html = Buffer.from('<!doctype html><script>alert(1)</script>')
  const disguised = await upload(ana.token, channelPath, 'foto.png', 'image/png', html)
  check('HTML renomeado para .png é recusado (415)', disguised.status === 415, disguised.status)

  // 7. Anexo pendente da Ana: a Bia não pode usar; a Ana pode.
  const pending = await upload(ana.token, channelPath, 'outra.png', 'image/png', PNG)
  const stolen = await api(`${channelPath}/messages`, {
    token: bia.token,
    method: 'POST',
    body: { content: 'peguei', attachment_ids: [pending.body.id] }
  })
  check('bia não anexa o arquivo da ana', stolen.status === 400, stolen)
  check('e a mensagem da bia não foi criada', !(await api(`${channelPath}/messages`, { token: ana.token })).body.some((m) => m.content === 'peguei'))

  // 8. DM Ana↔Bia com áudio.
  const conv = (await api(`/conversations/with/${bia.id}`, { token: ana.token })).body
  const convPath = `/conversations/${conv.id}`
  const wrongRoom = await api(`${convPath}/messages`, {
    token: ana.token,
    method: 'POST',
    body: { content: '', attachment_ids: [pending.body.id] }
  })
  check('anexo do canal não vai para a DM', wrongRoom.status === 400, wrongRoom.status)
  const reuse = await api(`${channelPath}/messages`, {
    token: ana.token,
    method: 'POST',
    body: { content: 'agora sim', attachment_ids: [pending.body.id] }
  })
  check('ana usa o próprio anexo pendente depois', reuse.status === 201 && reuse.body.attachments?.length === 1, reuse.status)

  const audio = await upload(ana.token, convPath, 'voz.ogg', 'audio/ogg', OGG, { duration_ms: 3000 })
  check('upload de áudio na DM', audio.status === 201 && audio.body.kind === 'audio', audio)
  const dm = await api(`${convPath}/messages`, {
    token: ana.token,
    method: 'POST',
    body: { content: '', attachment_ids: [audio.body.id] }
  })
  check('mensagem de áudio na DM', dm.status === 201, dm.status)
  const biaDm = (await api(`${convPath}/messages`, { token: bia.token })).body
  const biaAudio = biaDm.find((m) => m.id === dm.body.id)?.attachments?.[0]
  check('bia vê o áudio na DM', biaAudio?.kind === 'audio' && biaAudio?.duration_ms === 3000, biaAudio)
  const biaConvs = (await api('/conversations', { token: bia.token })).body
  const preview = biaConvs.find((c) => c.id === conv.id)?.last_message?.content
  check('prévia da DM mostra "🎤 Áudio"', preview === '🎤 Áudio', preview)
  check('carla não abre o áudio da DM', (await fetchFile(audio.body.id, await mediaToken(carla))).status === 404)

  // 9. Navegador: Bia com o canal aberto vê a imagem chegar em tempo real.
  browser = await chromium.launch({ executablePath: process.env.CHROME })
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } })
  const page = await context.newPage()
  await page.addInitScript(() => {
    const noop = () => () => {}
    window.api = {
      background: {
        notify: () => {}, setCallState: () => {}, quit: () => {}, getAutostart: async () => null,
        setAutostart: async () => null, onToggleMute: noop, onQuitRequested: noop, onNavigate: noop
      }
    }
  })
  await page.goto(APP + '#/login')
  await page.fill('input[autocomplete=username]', bia.email)
  await page.fill('input[type=password]', bia.password)
  await page.click('button[type=submit]')
  await page.getByText('Adicionar amigo').first().waitFor({ timeout: 30000 })
  await page.goto(APP + `#/servers/${serverId}/channels/${channel.id}`)
  await page.getByText('agora sim').first().waitFor({ timeout: 15000 })
  const before = await page.evaluate(() => document.querySelectorAll('img[src*="/media/"]').length)

  const live = await upload(ana.token, channelPath, 'aovivo.png', 'image/png', PNG, { width: 1, height: 1 })
  await api(`${channelPath}/messages`, { token: ana.token, method: 'POST', body: { content: 'ao vivo', attachment_ids: [live.body.id] } })
  let loaded = false
  for (let i = 0; i < 25 && !loaded; i++) {
    loaded = await page.evaluate((id) => {
      const img = [...document.querySelectorAll('img[src*="/media/"]')].find((el) => el.src.includes(id))
      return Boolean(img && img.complete && img.naturalWidth > 0)
    }, live.body.id)
    if (!loaded) await sleep(200)
  }
  check('bia vê a imagem nova em até 5 s (tempo real)', loaded, { before })

  // 10. Apagar a mensagem apaga o arquivo.
  const del = await api(`${channelPath}/messages/${msg.body.id}`, { token: ana.token, method: 'DELETE' })
  check('ana apaga a mensagem', del.status === 200, del.status)
  check('arquivo apagado não abre mais', (await fetchFile(png.body.id, biaMedia)).status === 404)
  check('e sumiu do disco', !existsSync(join(UPLOADS_DIR, png.body.id)), UPLOADS_DIR)
} catch (err) {
  console.log('FAIL', err.message.split('\n').slice(0, 4).join(' / '))
  process.exitCode = 1
} finally {
  await browser?.close()
}
