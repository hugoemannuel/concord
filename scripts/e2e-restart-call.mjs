// E2E: reiniciar o backend no meio de uma chamada não pode ser percebido.
// Dois clientes (Chromium, mídia fake) num canal de voz: a ana fala (tom
// contínuo) e transmite a tela, a bia está mutada e assiste. O backend
// reinicia (SIGTERM e sobe de novo, como o systemctl restart) e o script
// confere que:
//   - a sinalização do LiveKit não caiu (sem "ICE restart"/"resuming signal");
//   - o áudio não parou (pacotes RTP contados a cada ~50 ms nos dois lados);
//   - nenhum aviso de reconexão nem "saiu da chamada" apareceu;
//   - o selo LIVE da ana e o ícone de mudo da bia não piscaram;
//   - a mensagem mandada durante o reinício aparece uma vez (nem perdida nem
//     duplicada) para a ana, que estava com o canal de texto aberto;
//   - a troca de processo fica abaixo de 1 s mesmo com um download longo em
//     andamento (cliente que não lê) e um WebSocket morto (não confirma o
//     fechamento) — os dois direto no backend;
//   - quem foi silenciado por um moderador continua silenciado depois de um
//     reinício (e liberar ainda funciona);
//   - uma chamada de DM atravessa outro reinício: continua no servidor, os dois
//     se ouvem, mudo e tela ainda chegam ao servidor e desligar encerra para os
//     dois.
//
// Precisa do mesmo caminho da VPS: Caddy na frente (o deploy/Caddyfile de
// verdade, com /rtc direto para o LiveKit), backend com a porta segurada como
// pelo concord-server.socket (o script faz esse papel) e LiveKit locais.
//
//   1. Postgres e LiveKit (portas de teste, para não brigar com o dev):
//        docker run -d --name e2e-pg -e POSTGRES_USER=u -e POSTGRES_PASSWORD=p \
//          -e POSTGRES_DB=concord -p 127.0.0.1:15432:5432 postgres:17.11
//        docker run -d --name e2e-lk --network host \
//          -e LIVEKIT_KEYS="devkey: devsecret-devsecret-devsecret-devsecret" \
//          -e LIVEKIT_CONFIG="$(printf 'port: 17880\nbind_addresses: ["127.0.0.1"]\nrtc:\n  tcp_port: 17881\n  udp_port: 17882\n  use_external_ip: false\n  node_ip: "127.0.0.1"\n  enable_loopback_candidate: true\n')" \
//          livekit/livekit-server:v1.13.11
//   2. Caddy com os trechos do deploy/Caddyfile (endereço e portas do teste), na
//      mesma versão da VPS:
//        node scripts/e2e-restart-call.mjs --caddyfile > /tmp/Caddyfile.e2e
//        docker run -d --name e2e-caddy --network host \
//          -v /tmp/Caddyfile.e2e:/etc/caddy/Caddyfile:ro caddy:2.11.7
//   3. Backend numa pasta com .env (DATABASE_URL do passo 1, LIVEKIT_PORT=17880,
//      as chaves acima, PORT=18090, HOST=127.0.0.1), migrations/ e o binário
//      (cd backend && go build -o <pasta>/concord-server ./cmd). O script segura
//      a porta (python3) e sobe/reinicia o backend sozinho; não deixe outro
//      rodando na porta. BACKEND_SOCKET=0 testa sem o socket (o backend escuta
//      sozinho e fecha a porta no reinício).
//   4. Renderer apontando para o Caddy, servido em APP:
//        cd frontend && VITE_SERVER_URL=http://127.0.0.1:18080 npx electron-vite build
//        python3 -m http.server 5174 -d out/renderer
//   5. BACKEND_DIR=<pasta> APP=http://localhost:5174/ node scripts/e2e-restart-call.mjs
//
// Variáveis: CADDY_PORT (18080), BACKEND_PORT (18090), LIVEKIT_PORT (17880),
// MAX_AUDIO_STALL_MS (150), MAX_HANDOVER_MS (1000), CHROME (Chromium alternativo).
import { createRequire } from 'module'
import { spawn } from 'child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { connect as tcpConnect } from 'net'
import { tmpdir } from 'os'
import { join } from 'path'

const CADDY_PORT = process.env.CADDY_PORT ?? '18080'
const BACKEND_PORT = process.env.BACKEND_PORT ?? '18090'
const LIVEKIT_PORT = process.env.LIVEKIT_PORT ?? '17880'

// deploy/Caddyfile com o endereço e as portas do teste: os trechos (snippets)
// de verdade e um bloco de site local no lugar dos da VPS.
if (process.argv[2] === '--caddyfile') {
  const prod = readFileSync(new URL('../deploy/Caddyfile', import.meta.url), 'utf8')
  const snippets = prod.slice(0, prod.indexOf('# PUBLIC_URL dos apps desktop.'))
  const test = `${snippets}http://127.0.0.1:${CADDY_PORT} {\n\timport salinha_app\n}\n`
    .replaceAll('127.0.0.1:7880', `127.0.0.1:${LIVEKIT_PORT}`)
    .replaceAll('127.0.0.1:8090', `127.0.0.1:${BACKEND_PORT}`)
  process.stdout.write(`{\n\tadmin off\n}\n\n${test}`)
  process.exit(0)
}

const require = createRequire(new URL('../frontend/package.json', import.meta.url))
const { chromium } = require('playwright')

const API = process.env.API ?? `http://127.0.0.1:${CADDY_PORT}/api`
const HEALTH = `http://127.0.0.1:${BACKEND_PORT}/healthz`
const APP = process.env.APP ?? 'http://localhost:5174/'
const BACKEND_DIR = process.env.BACKEND_DIR
const MAX_AUDIO_STALL_MS = Number(process.env.MAX_AUDIO_STALL_MS ?? 150)
const MAX_HANDOVER_MS = Number(process.env.MAX_HANDOVER_MS ?? 1000)
const run = Date.now().toString(36)
if (!BACKEND_DIR) {
  console.error('defina BACKEND_DIR (pasta com .env, migrations/ e concord-server) — ver o cabeçalho')
  process.exit(2)
}

// Tom contínuo como microfone: com o DTX, silêncio não manda pacote nenhum.
function writeToneWav(path, seconds = 30, rate = 48000) {
  const samples = seconds * rate
  const buf = Buffer.alloc(44 + samples * 2)
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + samples * 2, 4); buf.write('WAVE', 8)
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22)
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34)
  buf.write('data', 36); buf.writeUInt32LE(samples * 2, 40)
  for (let i = 0; i < samples; i++) {
    buf.writeInt16LE(Math.round(12000 * Math.sin((2 * Math.PI * 440 * i) / rate)), 44 + i * 2)
  }
  writeFileSync(path, buf)
}
const TONE = join(tmpdir(), 'concord-e2e-restart-tone.wav')
writeToneWav(TONE)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ─── Clientes problemáticos, direto no backend ──────────────────────────────

// Arquivo grande em updates/ do backend (o PC de casa serve /updates por ele).
const BIG_FILE = 'e2e-restart-download.bin'
mkdirSync(join(BACKEND_DIR, 'updates'), { recursive: true })
writeFileSync(join(BACKEND_DIR, 'updates', BIG_FILE), Buffer.alloc(64 << 20))

/** Pede o download e nunca lê: a resposta fica travada no backend. */
function stuckDownload() {
  return new Promise((resolve, reject) => {
    const socket = tcpConnect(Number(BACKEND_PORT), '127.0.0.1', () => {
      socket.write(`GET /updates/${BIG_FILE} HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n`)
      socket.once('data', () => {
        socket.pause() // para de ler: o kernel enche e o backend trava na escrita
        resolve(socket)
      })
    })
    socket.on('error', () => {})
    socket.once('error', reject)
  })
}

/** Abre o WebSocket do chat e some: não lê nem confirma o fechamento. */
function deadWebSocket(token) {
  return new Promise((resolve, reject) => {
    const socket = tcpConnect(Number(BACKEND_PORT), '127.0.0.1', () => {
      socket.write(
        `GET /ws?token=${encodeURIComponent(token)} HTTP/1.1\r\nHost: 127.0.0.1\r\n` +
          'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
          'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n'
      )
      socket.once('data', (d) => {
        if (!d.toString().startsWith('HTTP/1.1 101')) return reject(new Error(`upgrade: ${d}`))
        socket.pause()
        resolve(socket)
      })
    })
    socket.on('error', () => {})
    socket.once('error', reject)
  })
}

// ─── Backend: sobe e reinicia como o systemd (SIGTERM, espera sair, sobe) ───

// Como na VPS, a porta é de um "systemd" (concord-server.socket): um processo
// à parte segura o socket e o passa ao backend (LISTEN_FDS) a cada subida, então
// a porta nunca fecha no reinício. BACKEND_SOCKET=0 testa o backend escutando
// sozinho (sem o socket).
const SOCKET_ACTIVATION = process.env.BACKEND_SOCKET !== '0'
const SUPERVISOR = `
import os, signal, socket, subprocess, sys
port, cwd = int(sys.argv[1]), sys.argv[2]
s = socket.socket(); s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
s.bind(("127.0.0.1", port)); s.listen(4096); fd = s.fileno()
def pre():
    # Se o supervisor morrer (o script caiu no meio), o backend morre junto.
    import ctypes; ctypes.CDLL("libc.so.6").prctl(1, signal.SIGKILL)
    os.dup2(fd, 3)
    os.environ["LISTEN_FDS"] = "1"; os.environ["LISTEN_PID"] = str(os.getpid())
child = None
print("listening", flush=True)
for line in sys.stdin:
    cmd = line.strip()
    if cmd == "start":
        child = subprocess.Popen(["./concord-server"], cwd=cwd, preexec_fn=pre, pass_fds=(fd,))
        print("started", flush=True)
    elif cmd == "stop" and child:
        child.send_signal(signal.SIGTERM); child.wait(); print("exited", flush=True)
    elif cmd == "kill" and child and child.poll() is None:
        child.kill(); child.wait()
`
let supervisor = null
let backend = null
let backendLog = ''
const keepLog = (d) => { backendLog = (backendLog + d.toString()).slice(-20000) }
const supervisorReplies = []
function supervisorSays(word) {
  return new Promise((resolve) => supervisorReplies.push({ word, resolve }))
}
async function startBackend() {
  if (SOCKET_ACTIVATION) {
    if (!supervisor) {
      supervisor = spawn('python3', ['-c', SUPERVISOR, BACKEND_PORT, BACKEND_DIR], { stdio: ['pipe', 'pipe', 'pipe'] })
      supervisor.stderr.on('data', keepLog)
      supervisor.stdout.on('data', (d) => {
        for (const word of d.toString().split('\n').filter(Boolean)) {
          const i = supervisorReplies.findIndex((r) => r.word === word)
          if (i >= 0) supervisorReplies.splice(i, 1)[0].resolve()
          else keepLog(word + '\n')
        }
      })
      await supervisorSays('listening')
    }
    const started = supervisorSays('started')
    supervisor.stdin.write('start\n')
    await started
    return
  }
  backend = spawn('./concord-server', [], { cwd: BACKEND_DIR, stdio: ['ignore', 'pipe', 'pipe'] })
  backend.stdout.on('data', keepLog)
  backend.stderr.on('data', keepLog)
}
async function waitHealthy(timeoutMs = 20000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(HEALTH, { signal: AbortSignal.timeout(2000) })
      if (r.ok) return Date.now()
    } catch {
      // ainda subindo
    }
    await sleep(20)
  }
  throw new Error(`backend não respondeu ${HEALTH}\n${backendLog}`)
}
// Se o script morrer no meio, o backend que ele subiu não fica rodando.
process.on('exit', () => {
  if (backend && backend.exitCode === null) backend.kill('SIGKILL')
  if (supervisor && supervisor.exitCode === null) {
    supervisor.stdin.write('kill\n')
    supervisor.kill('SIGKILL')
  }
})
async function stopBackend() {
  if (SOCKET_ACTIVATION) {
    if (!supervisor) return
    const exited = supervisorSays('exited')
    supervisor.stdin.write('stop\n')
    await exited
    return
  }
  if (!backend || backend.exitCode !== null) return
  const exited = new Promise((r) => backend.once('exit', r))
  backend.kill('SIGTERM')
  await exited
}

try {
  await fetch(HEALTH, { signal: AbortSignal.timeout(1000) })
  console.error(`já há um backend em ${HEALTH}: pare-o (o script sobe o dele)`)
  process.exit(2)
} catch {
  // porta livre
}
await startBackend()
await waitHealthy()

// ─── Dados: ana e bia no mesmo servidor, com canal de voz ───────────────────

async function api(path, { token, method = 'GET', body } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text}`)
  return text ? JSON.parse(text) : null
}
/**
 * Confirma o e-mail como o usuário faria: sem SMTP o backend imprime o e-mail
 * no log (LogMailer), e o link traz o token.
 */
async function verifyEmail(email) {
  const start = Date.now()
  while (Date.now() - start < 10000) {
    const at = backendLog.lastIndexOf(`para ${email}`)
    const token = at >= 0 && /\/verify-email\?token=([^\s&]+)/.exec(backendLog.slice(at))?.[1]
    if (token) {
      await api('/auth/verify-email', { method: 'POST', body: { token: decodeURIComponent(token) } })
      return
    }
    await sleep(100)
  }
  throw new Error(`e-mail de confirmação de ${email} não apareceu no log do backend`)
}
async function makeUser(name) {
  const email = `${name}-${run}@teste.dev`
  const password = 'senha-forte-123'
  const { access_token } = await api('/auth/register', {
    method: 'POST',
    body: { username: `${name}${run}`, display_name: name, email, password }
  })
  await verifyEmail(email)
  const me = await api('/users/me', { token: access_token })
  return { email, password, token: access_token, id: me.id ?? me.user?.id, username: `${name}${run}` }
}

const ana = await makeUser('ana')
const bia = await makeUser('bia')
await api('/friends/request', { token: ana.token, method: 'POST', body: { username: bia.username } })
await api(`/friends/${ana.username}/accept`, { token: bia.token, method: 'PUT' })
const server = await api('/servers', { token: ana.token, method: 'POST', body: { name: `Reinício ${run}` } })
const serverId = server.id ?? server.server?.id
await api(`/servers/${serverId}/channels`, {
  token: ana.token, method: 'POST', body: { name: 'voz-e2e', type: 'voice' }
})
const channels = await api(`/servers/${serverId}/channels`, { token: ana.token })
const textChannel = (Array.isArray(channels) ? channels : channels.channels).find((c) => c.type !== 'voice')
const voiceChannel = (Array.isArray(channels) ? channels : channels.channels).find((c) => c.type === 'voice')
await api(`/servers/${serverId}/invite`, { token: ana.token, method: 'POST', body: { user_id: bia.id } })
const invites = await api('/invites', { token: bia.token })
const invite = (Array.isArray(invites) ? invites : invites.invites).find((i) => (i.server_id ?? i.server?.id) === serverId)
await api(`/invites/${invite.id}/accept`, { token: bia.token, method: 'POST' })
console.log('setup ok', { serverId, textChannel: textChannel.name })

// ─── Navegadores ────────────────────────────────────────────────────────────

const browser = await chromium.launch({
  executablePath: process.env.CHROME,
  args: [
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    `--use-file-for-fake-audio-capture=${TONE}`,
    '--auto-select-desktop-capture-source=Entire screen',
    '--autoplay-policy=no-user-gesture-required'
  ]
})

// Roda na página antes do app: guarda os RTCPeerConnection (para contar
// pacotes) e anota todo aviso que apareça na tela.
function instrument() {
  window.__pcs = []
  const Original = window.RTCPeerConnection
  window.RTCPeerConnection = class extends Original {
    constructor(...args) {
      super(...args)
      window.__pcs.push(this)
    }
  }
  // Códigos de fechamento do WebSocket do chat (o 1012 do reinício).
  window.__chatCloses = []
  const OriginalWs = window.WebSocket
  window.WebSocket = class extends OriginalWs {
    constructor(url, ...rest) {
      super(url, ...rest)
      if (String(url).includes('/ws?')) {
        this.addEventListener('close', (e) => window.__chatCloses.push(e.code))
      }
    }
  }
  window.__texts = []
  new MutationObserver((records) => {
    for (const r of records) {
      for (const node of r.addedNodes) {
        const text = node.textContent?.trim()
        if (text) window.__texts.push([performance.now(), text.slice(0, 200)])
      }
    }
  }).observe(document.documentElement, { childList: true, subtree: true })
}

/**
 * Amostra a cada ~50 ms: pacotes de áudio/vídeo (recebidos e enviados), quantos
 * selos LIVE há na tela e o ícone de voz de `watchName` na lista do canal.
 */
function startMonitor(watchName) {
  const m = { on: true, samples: [] }
  window.__monitor = m
  // Ícone de voz ao lado do nome (outros [title] na linha, como o nível, não contam).
  const iconOf = (name) => {
    const row = [...document.querySelectorAll('span')].find((el) => el.textContent === name)?.parentElement
    const icon = [...(row?.querySelectorAll('[title]') ?? [])].find((el) =>
      /microfone|Áudio/i.test(el.getAttribute('title')))
    return icon?.getAttribute('title') ?? 'nenhum'
  }
  ;(async () => {
    while (m.on) {
      const s = { t: performance.now(), audioIn: 0, videoIn: 0, audioOut: 0 }
      for (const pc of window.__pcs) {
        if (pc.connectionState === 'closed') continue
        const stats = await pc.getStats()
        stats.forEach((r) => {
          if (r.type === 'inbound-rtp' && r.kind === 'audio') s.audioIn += r.packetsReceived ?? 0
          if (r.type === 'inbound-rtp' && r.kind === 'video') s.videoIn += r.packetsReceived ?? 0
          if (r.type === 'outbound-rtp' && r.kind === 'audio') s.audioOut += r.packetsSent ?? 0
        })
      }
      s.live = [...document.querySelectorAll('span')].filter((el) => el.textContent === 'LIVE').length
      s.icon = watchName ? iconOf(watchName) : null
      m.samples.push(s)
      await new Promise((r) => setTimeout(r, 50))
    }
  })()
}

// Segura a reconexão do WebSocket do chat da ana enquanto `chatHeld`: cada
// tentativa é recusada na hora (o app tenta de novo sozinho). Assim a mensagem
// mandada no reinício com certeza não chega pelo WebSocket, e só aparece se a
// ressincronização ao reconectar a buscar.
let chatHeld = false
const consoleLines = []
async function openClient(user, { holdableChat = false } = {}) {
  const context = await browser.newContext({
    permissions: ['microphone', 'camera'],
    viewport: { width: 1600, height: 1000 }
  })
  const page = await context.newPage()
  if (holdableChat) {
    await page.routeWebSocket(/\/ws\?token=/, (ws) => {
      if (chatHeld) {
        ws.close({ code: 1011, reason: 'segurado pelo teste' })
        return
      }
      ws.connectToServer()
    })
  }
  await page.addInitScript(instrument)
  page.on('console', (m) => consoleLines.push({ who: user.username, type: m.type(), text: m.text(), at: Date.now() }))
  await page.goto(APP + '#/login')
  // Campo "E-mail ou nome de usuário" (type=text desde o login por usuário).
  await page.fill('input[autocomplete=username]', user.email)
  await page.fill('input[type=password]', user.password)
  await page.click('button[type=submit]')
  await page.waitForURL((u) => !u.hash.includes('login'))
  await page.getByText('Adicionar amigo').first().waitFor({ timeout: 30000 })
  await page.goto(APP + `#/servers/${serverId}`)
  await page.getByText('voz-e2e', { exact: true }).first().click()
  return page
}

async function waitFor(desc, fn, ok, timeout = 20000) {
  const start = Date.now()
  let last
  while (Date.now() - start < timeout) {
    last = await fn()
    if (ok(last)) { console.log(`PASS ${desc}`); return last }
    await sleep(250)
  }
  throw new Error(`FAIL ${desc}: ${JSON.stringify(last)}`)
}
const failures = []
function check(desc, ok, detail) {
  if (ok) console.log(`PASS ${desc}`)
  else { console.log(`FAIL ${desc}: ${JSON.stringify(detail)}`); failures.push(desc) }
}

/** Maior intervalo (ms) em que o contador `key` não subiu entre [from, to]. */
function longestStall(samples, key, from, to) {
  let worst = 0
  let since = null
  let prev = null
  for (const s of samples) {
    if (s.t < from || s.t > to) { prev = s; continue }
    if (prev && s[key] > prev[key]) since = s.t
    else if (prev) {
      since ??= prev.t
      worst = Math.max(worst, s.t - since)
    }
    prev = s
  }
  return Math.round(worst)
}

const liveTracks = (page) => page.evaluate(() =>
  [...document.querySelectorAll('audio')].flatMap((el) =>
    el.srcObject ? el.srcObject.getAudioTracks().map((t) => t.readyState) : []))
const packets = (page) => page.evaluate(async () => {
  let audioIn = 0, videoIn = 0, audioOut = 0
  for (const pc of window.__pcs) {
    if (pc.connectionState === 'closed') continue
    ;(await pc.getStats()).forEach((r) => {
      if (r.type === 'inbound-rtp' && r.kind === 'audio') audioIn += r.packetsReceived ?? 0
      if (r.type === 'inbound-rtp' && r.kind === 'video') videoIn += r.packetsReceived ?? 0
      if (r.type === 'outbound-rtp' && r.kind === 'audio') audioOut += r.packetsSent ?? 0
    })
  }
  return { audioIn, videoIn, audioOut }
})

let failed = false
try {
  const pageA = await openClient(ana, { holdableChat: true })
  const pageB = await openClient(bia)
  await waitFor('ana ouve a bia', () => liveTracks(pageA), (t) => t.includes('live'))
  await waitFor('bia ouve a ana', () => liveTracks(pageB), (t) => t.includes('live'))

  // bia mutada; ana transmite a tela e a bia assiste.
  await pageB.getByRole('button', { name: 'Silenciar microfone' }).first().click()
  await pageA.getByRole('button', { name: 'Compartilhar tela' }).first().click()
  await pageB.getByText('Assistir transmissão').first().click({ timeout: 20000 })
  await waitFor('bia recebe a tela da ana', () => packets(pageB), (p) => p.videoIn > 0)

  // A ana vai para o canal de texto (continua na chamada) e manda uma mensagem.
  // Pelo title do botão: o canal principal tem uma estrela junto do nome.
  await pageA.locator(`button[title="${textChannel.name}"]`).first().click()
  await api(`/channels/${textChannel.id}/messages`, { token: bia.token, method: 'POST', body: { content: `antes ${run}` } })
  await waitFor('ana vê a mensagem de antes', () => pageA.getByText(`antes ${run}`).count(), (n) => n === 1)
  await waitFor('ana vê a bia mutada', () => pageA.evaluate((name) => {
    const row = [...document.querySelectorAll('span')].find((el) => el.textContent === name)?.parentElement
    const icon = [...(row?.querySelectorAll('[title]') ?? [])].find((el) =>
      /microfone|Áudio/i.test(el.getAttribute('title')))
    return icon?.getAttribute('title')
  }, 'bia'), (t) => t === 'Microfone desativado')
  await waitFor('bia vê o selo LIVE da ana', () => pageB.getByText('LIVE', { exact: true }).count(), (n) => n > 0)
  await waitFor('ana vê o próprio selo LIVE', () => pageA.getByText('LIVE', { exact: true }).count(), (n) => n > 0)
  await waitFor('áudio fluindo', () => packets(pageB), (p) => p.audioIn > 100)

  await pageA.evaluate(startMonitor, 'bia')
  await pageB.evaluate(startMonitor, null)
  const clock = async (page) => page.evaluate(() => performance.now())
  await sleep(2000)

  // ─── Reinício ──────────────────────────────────────────────────────────
  // Um download travado e um app "dormindo" seguravam o reinício (até 10 s + 5 s).
  const stuck = [await stuckDownload(), await deadWebSocket(bia.token)]

  const consoleBefore = consoleLines.length
  const t0 = { a: await clock(pageA), b: await clock(pageB) }
  chatHeld = true
  const stopAt = Date.now()
  const stopping = stopBackend()
  // Mandada no meio do reinício: o Caddy segura até o backend novo subir.
  const during = api(`/channels/${textChannel.id}/messages`, {
    token: bia.token, method: 'POST', body: { content: `durante ${run}` }
  }).then(() => Date.now(), (err) => err)
  await stopping
  const exitedAt = Date.now()
  await startBackend()
  const healthyAt = await waitHealthy()
  const sentAt = await during
  // A ana volta só agora: a mensagem já foi criada sem ela conectada.
  chatHeld = false
  console.log(`backend: SIGTERM→saiu ${exitedAt - stopAt} ms, saiu→/healthz ${healthyAt - exitedAt} ms`)
  check(`troca de processo abaixo de ${MAX_HANDOVER_MS} ms com download travado e WebSocket morto`,
    healthyAt - stopAt < MAX_HANDOVER_MS, { handoverMs: healthyAt - stopAt })
  stuck.forEach((socket) => socket.destroy())
  const sent = typeof sentAt === 'number'
  check('mensagem mandada durante o reinício foi aceita (o Caddy segurou)', sent, sent ? null : sentAt.message)
  if (sent) {
    console.log(`  aceita ${sentAt - stopAt} ms após o SIGTERM`)
    await waitFor('ana vê a mensagem mandada durante o reinício', () => pageA.getByText(`durante ${run}`).count(), (n) => n >= 1, 10000)
  }
  await sleep(6000)
  const t1 = { a: await clock(pageA), b: await clock(pageB) }
  const monA = await pageA.evaluate(() => { window.__monitor.on = false; return window.__monitor.samples })
  const monB = await pageB.evaluate(() => { window.__monitor.on = false; return window.__monitor.samples })
  const textsA = await pageA.evaluate((from) => window.__texts.filter(([t]) => t >= from).map(([, x]) => x), t0.a)
  const textsB = await pageB.evaluate((from) => window.__texts.filter(([t]) => t >= from).map(([, x]) => x), t0.b)
  const closesB = await pageB.evaluate(() => window.__chatCloses)
  check('o chat da bia caiu com 1012 (servidor reiniciando)', closesB.includes(1012), closesB)

  // ─── Conferências ──────────────────────────────────────────────────────
  const signal = consoleLines.slice(consoleBefore).filter((l) =>
    /ICE restart|resuming signal|signal disconnected|reconnecting/i.test(l.text))
  check('sinalização do LiveKit não caiu (sem ICE restart / resume)', signal.length === 0, signal)

  const stallIn = longestStall(monB, 'audioIn', t0.b, t1.b)
  const stallOut = longestStall(monA, 'audioOut', t0.a, t1.a)
  console.log(`maior pausa: áudio recebido pela bia ${stallIn} ms, enviado pela ana ${stallOut} ms (limite ${MAX_AUDIO_STALL_MS} ms)`)
  check('áudio da ana chegou sem pausa para a bia', stallIn < MAX_AUDIO_STALL_MS, { stallIn })
  check('áudio da ana saiu sem pausa', stallOut < MAX_AUDIO_STALL_MS, { stallOut })
  const videoAfter = monB.filter((s) => s.t > t0.b)
  check('tela da ana continuou chegando',
    videoAfter.length > 1 && videoAfter.at(-1).videoIn > videoAfter[0].videoIn, videoAfter.at(-1))

  const liveMinA = Math.min(...monA.filter((s) => s.t >= t0.a).map((s) => s.live))
  const liveMinB = Math.min(...monB.filter((s) => s.t >= t0.b).map((s) => s.live))
  check('selo LIVE não piscou (ana)', liveMinA > 0, { liveMinA })
  check('selo LIVE não piscou (bia)', liveMinB > 0, { liveMinB })
  const icons = [...new Set(monA.filter((s) => s.t >= t0.a).map((s) => s.icon))]
  check('ícone de mudo da bia não piscou (visto pela ana)',
    icons.length === 1 && icons[0] === 'Microfone desativado', icons)

  const warnings = [...textsA, ...textsB].filter((x) =>
    /reconect|saiu da chamada|perdida|Não foi possível/i.test(x))
  check('nenhum aviso de reconexão ou queda na tela', warnings.length === 0, warnings)

  if (sent) {
    check('mensagem de durante aparece uma vez só', (await pageA.getByText(`durante ${run}`).count()) === 1,
      await pageA.getByText(`durante ${run}`).count())
  }
  check('mensagem de antes não duplicou', (await pageA.getByText(`antes ${run}`).count()) === 1,
    await pageA.getByText(`antes ${run}`).count())
  check('chamada continua (bia ouve a ana)', (await liveTracks(pageB)).includes('live'))

  // ─── Silenciado por moderador atravessa o reinício ─────────────────────
  // A ana (dona) silencia a bia no servidor; o reinício não pode liberá-la.
  const channelState = () => api(`/calls/active?scope=channel&id=${voiceChannel.id}`, { token: ana.token })
    .catch((err) => ({ error: err.message }))
  const biaIn = (st) => st.participants?.find((p) => p.user_id === bia.id)
  const channelCall = await channelState()
  await api(`/calls/${channelCall.call.id}/participants/${bia.id}/server-mute`, {
    token: ana.token, method: 'POST', body: { muted: true }
  })
  await waitFor('bia silenciada pela moderação', channelState, (st) => biaIn(st)?.server_muted === true)
  await stopBackend()
  await startBackend()
  await waitHealthy()
  const afterModRestart = await channelState()
  check('silenciada pela moderação continua depois do reinício',
    biaIn(afterModRestart)?.server_muted === true && biaIn(afterModRestart)?.muted === true, biaIn(afterModRestart))
  await api(`/calls/${channelCall.call.id}/participants/${bia.id}/server-mute`, {
    token: ana.token, method: 'POST', body: { muted: false }
  })
  await waitFor('liberar depois do reinício funciona', channelState, (st) => biaIn(st)?.server_muted === false)

  // ─── DM: reinício no meio de uma chamada de DM ─────────────────────────
  // Antes, atender a DM não ia para o banco ("ringing") e todo reinício a
  // encerrava; o app então ficava com mídia e sem chamada no servidor (mudo,
  // tela e desligar davam 404, e o outro lado nunca recebia o fim).
  // A ana está no canal de texto (painel "Desconectar da voz"), a bia no de voz.
  const leaveVoice = (page) => page.getByRole('button', { name: /^Desconectar( da voz)?$/ }).first().click()
  await leaveVoice(pageB)
  await leaveVoice(pageA)
  await waitFor('DM: canal de voz desfeito',
    async () => [...(await liveTracks(pageA)), ...(await liveTracks(pageB))], (t) => t.length === 0)
  await pageA.goto(APP + `#/dm/${bia.id}`)
  await pageA.getByRole('button', { name: 'Iniciar chamada de voz' }).click({ timeout: 15000 })
  await pageB.getByRole('button', { name: 'Aceitar chamada' }).click({ timeout: 15000 })
  await waitFor('DM: bia ouve a ana', () => liveTracks(pageB), (t) => t.includes('live'))
  await waitFor('DM: ana ouve a bia', () => liveTracks(pageA), (t) => t.includes('live'))
  const conversations = await api('/conversations', { token: ana.token })
  const conversationId = (Array.isArray(conversations) ? conversations : conversations.conversations)
    .find((c) => c.other_user?.id === bia.id)?.id
  const dmState = (token = ana.token) => api(`/calls/active?scope=dm&id=${conversationId}`, { token })
    .catch((err) => ({ error: err.message }))
  const dmBefore = await waitFor('DM: ativa no servidor antes do reinício', dmState,
    (st) => st.call?.status === 'active')

  const dmConsole = consoleLines.length
  const dmT0 = { a: await clock(pageA), b: await clock(pageB) }
  await stopBackend()
  await startBackend()
  await waitHealthy()
  // Passa do prazo em que o app confirmaria um 404 (~4 s).
  await sleep(8000)

  const dmAfter = await dmState()
  check('DM: a chamada continua no servidor depois do reinício',
    dmAfter.call?.id === dmBefore.call?.id && dmAfter.call?.status === 'active' &&
      dmAfter.participants?.length === 2, dmAfter)
  check('DM: os dois continuam se ouvindo',
    (await liveTracks(pageA)).includes('live') && (await liveTracks(pageB)).includes('live'))
  const dmSignal = consoleLines.slice(dmConsole).filter((l) =>
    /ICE restart|resuming signal|signal disconnected/i.test(l.text))
  check('DM: sinalização do LiveKit não caiu', dmSignal.length === 0, dmSignal)
  const dmTexts = [
    ...(await pageA.evaluate((from) => window.__texts.filter(([t]) => t >= from).map(([, x]) => x), dmT0.a)),
    ...(await pageB.evaluate((from) => window.__texts.filter(([t]) => t >= from).map(([, x]) => x), dmT0.b))
  ].filter((x) => /reconect|encerrad|saiu da chamada|Não foi possível/i.test(x))
  check('DM: nenhum aviso de queda ou fim na tela', dmTexts.length === 0, dmTexts)

  // Depois do reinício o servidor ainda conhece a chamada: mudo e tela chegam.
  const anaIn = (st) => st.participants?.find((p) => p.user_id === ana.id)
  await pageA.getByRole('button', { name: 'Silenciar microfone' }).first().click()
  await waitFor('DM: mudo da ana chega ao servidor depois do reinício', dmState, (st) => anaIn(st)?.muted === true)
  await pageA.getByRole('button', { name: 'Ativar microfone' }).first().click()
  await waitFor('DM: desmutar também chega', dmState, (st) => anaIn(st)?.muted === false)
  await pageA.getByRole('button', { name: 'Compartilhar tela' }).first().click()
  await waitFor('DM: tela da ana chega ao servidor depois do reinício', dmState,
    (st) => (st.screen_sharing ?? []).includes(ana.id))
  const videoBefore = (await packets(pageB)).videoIn
  await pageB.getByText('Assistir transmissão').first().click({ timeout: 20000 })
  await waitFor('DM: bia recebe a tela da ana', () => packets(pageB), (p) => p.videoIn > videoBefore + 10)

  // Desligar depois do reinício encerra para os dois (não virou zumbi).
  await pageA.getByRole('button', { name: 'Encerrar chamada' }).first().click()
  await waitFor('DM: desligar encerra a chamada para a bia', () => liveTracks(pageB), (t) => t.length === 0, 10000)
  await waitFor('DM: a bia sai da tela da chamada',
    () => pageB.getByRole('button', { name: 'Encerrar chamada' }).count(), (n) => n === 0, 10000)
  await waitFor('DM: o servidor encerrou a chamada', () => dmState(bia.token), (st) => /404/.test(st.error ?? ''))

  if (failures.length) throw new Error(`${failures.length} conferência(s) falharam`)
} catch (err) {
  failed = true
  console.error(err.message)
} finally {
  await browser.close()
  await stopBackend()
  supervisor?.kill('SIGTERM')
}
process.exit(failed ? 1 : 0)
