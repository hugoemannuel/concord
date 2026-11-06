// E2E: compartilhar a tela no Linux/Wayland pelo seletor do sistema
// (xdg-desktop-portal + PipeWire), com o app Electron de verdade.
//
// Precisa de uma sessão Wayland com o portal funcionando (ex.: Hyprland com o
// xdg-desktop-portal-hyprland), backend + LiveKit rodando e o app buildado:
//   cd frontend && VITE_SERVER_URL=http://127.0.0.1:8080 npx electron-vite build
//   python3 -m http.server 5174 -d out/renderer       (renderer para a bia)
//   BACKEND_LOG=<log do backend> API=http://127.0.0.1:8080/api APP=http://localhost:5174/ \
//     node scripts/e2e-screen-wayland.mjs
// (sem SMTP o backend escreve o e-mail de confirmação no log: BACKEND_LOG é o
// arquivo para onde vai a saída dele, de onde o script tira o link.)
//
// A ana compartilha pelo app Electron (perfil próprio, sem mexer na Salinha
// aberta) e a bia assiste num Chromium headless (CHROME = outro executável). O
// script confere que:
//   - o modal de fontes do app NÃO abre (no Wayland ele não acha a fonte);
//   - o modal de qualidade abre, com o aviso de que o som não vai junto;
//   - o seletor do sistema abre e, escolhida a tela, a bia recebe o vídeo;
//   - fechar o seletor do sistema não mostra erro;
//   - sem o portal (NOPORTAL_BUS = endereço de um D-Bus vazio, ver abaixo), o
//     aviso diz o que instalar.
//
// No Hyprland o seletor é escolhido sozinho (hyprctl manda Tab + espaço para o
// hyprland-share-picker: "Screen 0"); fora dele, clique na tela quando o
// seletor abrir (PICK=manual força isso). Barramento vazio para o último passo:
//   printf '<busconfig><type>session</type><listen>unix:abstract=salinha-noportal</listen><policy context="default"><allow send_destination="*"/><allow own="*"/><allow user="*"/></policy></busconfig>' > /tmp/noportal.conf
//   dbus-daemon --config-file=/tmp/noportal.conf --fork --print-address
//   NOPORTAL_BUS=unix:abstract=salinha-noportal ...
import { createRequire } from 'module'
import { execFileSync } from 'child_process'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { createE2E } from './lib/e2e.mjs'

const frontend = fileURLToPath(new URL('../frontend', import.meta.url))
const require = createRequire(join(frontend, 'package.json'))
const { _electron: electron, chromium } = require('playwright')

const API = process.env.API ?? 'http://127.0.0.1:8080/api'
const APP = process.env.APP ?? 'http://localhost:5174/'
const AUTO_PICK = process.env.PICK !== 'manual' && !!process.env.HYPRLAND_INSTANCE_SIGNATURE
const run = Date.now().toString(36)
const { api, makeUser } = createE2E({ api: API, run })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

if (process.env.XDG_SESSION_TYPE !== 'wayland' || !process.env.WAYLAND_DISPLAY) {
  console.error('Rode numa sessão Wayland (XDG_SESSION_TYPE=wayland e WAYLAND_DISPLAY).')
  process.exit(2)
}

const failures = []
function check(desc, ok, detail) {
  if (ok) console.log(`PASS ${desc}`, detail === undefined ? '' : JSON.stringify(detail))
  else {
    console.log(`FAIL ${desc}: ${JSON.stringify(detail)}`)
    failures.push(desc)
  }
}
async function waitFor(desc, fn, ok, timeout = 30000) {
  const start = Date.now()
  let last
  while (Date.now() - start < timeout) {
    last = await fn()
    if (ok(last)) return last
    await sleep(300)
  }
  throw new Error(`FAIL ${desc}: ${JSON.stringify(last)}`)
}

// ─── Seletor do sistema (hyprland-share-picker) ────────────────────────────

function pickerOpen() {
  try {
    return JSON.parse(execFileSync('hyprctl', ['clients', '-j'], { encoding: 'utf8' })).some(
      (c) => c.class === 'hyprland-share-picker'
    )
  } catch {
    return false
  }
}
function sendToPicker(key) {
  // Hyprland com config em Lua (0.55+) e o formato antigo.
  const lua = `hl.dsp.send_shortcut({mods="", key="${key}", window="class:hyprland-share-picker"})`
  const out = execFileSync('hyprctl', ['dispatch', lua], { encoding: 'utf8' })
  if (!/^ok/.test(out.trim()))
    execFileSync('hyprctl', ['dispatch', 'sendshortcut', `, ${key}, class:hyprland-share-picker`])
}
async function waitPicker(timeout = 30000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (pickerOpen()) return true
    await sleep(300)
  }
  return false
}
/** Escolhe a primeira tela; sem Hyprland, espera alguém clicar. */
async function pickScreen() {
  if (!AUTO_PICK) {
    console.log('>>> escolha uma tela no seletor do sistema <<<')
    return
  }
  if (!(await waitPicker())) throw new Error('o seletor do sistema não abriu')
  await sleep(800)
  sendToPicker('Tab')
  await sleep(300)
  sendToPicker('space')
}
async function closePicker() {
  if (!(await waitPicker())) throw new Error('o seletor do sistema não abriu')
  await sleep(500)
  execFileSync('pkill', ['-f', '^hyprland-share-picker'])
}

// ─── Preparação ────────────────────────────────────────────────────────────

const ana = await makeUser('ana')
const bia = await makeUser('bia')
await api('/friends/request', { token: ana.token, method: 'POST', body: { username: bia.username } })
await api(`/friends/${ana.username}/accept`, { token: bia.token, method: 'PUT' })
const server = await api('/servers', { token: ana.token, method: 'POST', body: { name: `Tela ${run}` } })
const serverId = server.id ?? server.server?.id
await api(`/servers/${serverId}/channels`, {
  token: ana.token, method: 'POST', body: { name: 'voz-tela', type: 'voice' }
})
await api(`/servers/${serverId}/invite`, { token: ana.token, method: 'POST', body: { user_id: bia.id } })
const invites = await api('/invites', { token: bia.token })
const invite = (Array.isArray(invites) ? invites : invites.invites).find(
  (i) => (i.server_id ?? i.server?.id) === serverId
)
await api(`/invites/${invite.id}/accept`, { token: bia.token, method: 'POST' })

async function enterCall(page, user) {
  await page.waitForSelector('input[autocomplete=username]', { timeout: 30000 })
  await page.fill('input[autocomplete=username]', user.email)
  await page.fill('input[type=password]', user.password)
  await page.click('button[type=submit]')
  await page.getByText('Adicionar amigo').first().waitFor({ timeout: 30000 })
  await page.evaluate((id) => { location.hash = `#/servers/${id}` }, serverId)
  await page.getByText('voz-tela', { exact: true }).first().click()
  await page.getByRole('button', { name: 'Compartilhar tela' }).first().waitFor({ timeout: 20000 })
}

// A Salinha guarda o perfil em <XDG_CONFIG_HOME>/Concord (e a trava de
// instância única também): pasta própria para não esbarrar na aberta.
function launchApp(extraEnv = {}) {
  const config = mkdtempSync(join(tmpdir(), 'salinha-e2e-tela-'))
  return electron.launch({
    cwd: frontend,
    args: ['.', '--ozone-platform-hint=auto', `--user-data-dir=${join(config, 'chromium')}`],
    env: { ...process.env, XDG_CONFIG_HOME: config, ...extraEnv }
  })
}

const browser = await chromium.launch({
  executablePath: process.env.CHROME,
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream']
})
const apps = []
try {
  // bia assiste (Chromium headless, contando os quadros de vídeo recebidos).
  const ctx = await browser.newContext({
    permissions: ['microphone', 'camera'],
    viewport: { width: 1400, height: 900 }
  })
  const viewer = await ctx.newPage()
  await viewer.addInitScript(() => {
    window.__pcs = []
    const Original = window.RTCPeerConnection
    window.RTCPeerConnection = class extends Original {
      constructor(...args) {
        super(...args)
        window.__pcs.push(this)
      }
    }
  })
  await viewer.goto(APP + '#/login')
  await enterCall(viewer, bia)
  const received = () => viewer.evaluate(async () => {
    const out = { packets: 0, frames: 0, width: 0, height: 0 }
    for (const pc of window.__pcs) {
      if (pc.connectionState === 'closed') continue
      ;(await pc.getStats()).forEach((r) => {
        if (r.type !== 'inbound-rtp' || r.kind !== 'video') return
        out.packets += r.packetsReceived ?? 0
        out.frames += r.framesDecoded ?? 0
        out.width = Math.max(out.width, r.frameWidth ?? 0)
        out.height = Math.max(out.height, r.frameHeight ?? 0)
      })
    }
    return out
  })

  // ana compartilha pelo app Electron.
  const app = await launchApp()
  apps.push(app)
  await app.evaluate(() => {
    globalThis.__mainErrors = []
    process.on('uncaughtException', (err) => globalThis.__mainErrors.push(String(err)))
  })
  const page = await app.firstWindow()
  page.on('console', (m) => { if (m.type() === 'error') console.log('console(ana):', m.text()) })
  await enterCall(page, ana)
  check('fluxo do preload é o portal', (await page.evaluate(() => window.api?.screenShare?.flow)) === 'portal')

  const share = () => page.getByRole('button', { name: 'Compartilhar tela' }).first().click()
  const errorToasts = () => page.getByText('Não foi possível compartilhar a tela').count()

  // 1) Fechar o seletor do sistema é cancelar: sem erro e sem compartilhar.
  if (AUTO_PICK) {
    await share()
    await page.getByRole('button', { name: 'Escolher tela' }).click()
    await closePicker()
    await sleep(2000)
    check('fechar o seletor do sistema: sem toast de erro', (await errorToasts()) === 0)
    check('fechar o seletor do sistema: continua sem compartilhar',
      (await page.getByRole('button', { name: 'Parar de compartilhar tela' }).count()) === 0)
  }

  // 2) Compartilhar de verdade.
  await share()
  await page.getByRole('button', { name: 'Escolher tela' }).waitFor({ timeout: 10000 })
  check('modal de fontes do app não abre no Wayland',
    (await page.getByRole('button', { name: 'Aplicativos' }).count()) === 0)
  check('aviso de que o som não vai junto no Linux',
    (await page.getByText('No Linux, o som não vai junto').count()) === 1)
  await page.getByRole('button', { name: '720p' }).click()
  await page.getByRole('button', { name: 'Escolher tela' }).click()
  await pickScreen()
  await page.getByRole('button', { name: 'Parar de compartilhar tela' }).first()
    .waitFor({ timeout: AUTO_PICK ? 20000 : 120000 })
  check('ana está compartilhando', true)
  // A live só é baixada quando alguém assiste.
  await viewer.getByRole('button', { name: 'Assistir transmissão' }).click({ timeout: 20000 })
  const video = await waitFor('bia recebe a tela', received, (v) => v.frames > 30 && v.width > 0)
  check('bia recebe a tela (quadros decodificados)', true, video)
  check('a qualidade escolhida (720p) vale', video.height > 0 && video.height <= 720, video)
  const track = await page.evaluate(() => {
    const v = [...document.querySelectorAll('video')].find((el) => el.srcObject?.getVideoTracks?.().length)
    const t = v?.srcObject.getVideoTracks()[0]
    return t ? { state: t.readyState, surface: t.getSettings().displaySurface } : null
  })
  check('track local da tela está viva', track?.state === 'live', track)

  await page.getByRole('button', { name: 'Parar de compartilhar tela' }).first().click()
  await page.getByRole('button', { name: 'Compartilhar tela' }).first().waitFor({ timeout: 10000 })
  check('parar de compartilhar funciona', true)
  const mainErrors = await app.evaluate(() => globalThis.__mainErrors)
  check('processo main sem exceção', mainErrors.length === 0, mainErrors)
  await page.getByRole('button', { name: 'Desconectar', exact: true }).click().catch(() => {})
  await app.close()
  apps.pop()

  // 3) Sem o portal: o aviso diz o que instalar e nada abre.
  if (process.env.NOPORTAL_BUS) {
    const bare = await launchApp({ DBUS_SESSION_BUS_ADDRESS: process.env.NOPORTAL_BUS })
    apps.push(bare)
    const p = await bare.firstWindow()
    await enterCall(p, ana)
    await p.getByRole('button', { name: 'Compartilhar tela' }).first().click()
    const hint = p.getByText('para compartilhar a tela', { exact: false })
    await hint.first().waitFor({ timeout: 10000 })
    const text = await hint.first().textContent()
    check('sem portal: aviso diz o que instalar', /Instale o xdg-desktop-portal/.test(text), text)
    check('sem portal: não abre o modal de qualidade',
      (await p.getByRole('button', { name: 'Escolher tela' }).count()) === 0)
    await p.getByRole('button', { name: 'Desconectar', exact: true }).click().catch(() => {})
  }
} catch (err) {
  failures.push(err.message)
  console.error(err.message)
  for (const [i, a] of apps.entries()) {
    const shot = join(tmpdir(), `salinha-e2e-tela-${run}-${i}.png`)
    await (await a.firstWindow()).screenshot({ path: shot }).catch(() => {})
    console.error('captura:', shot)
  }
} finally {
  for (const a of apps) await a.close().catch(() => {})
  await browser.close().catch(() => {})
}
console.log(failures.length ? `\n${failures.length} falha(s)` : '\ntudo certo')
process.exit(failures.length ? 1 : 0)
