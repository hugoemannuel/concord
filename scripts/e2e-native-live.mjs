// E2E da live pelo motor nativo (docs/adr/0031), no Linux com Hyprland:
// a ana transmite pelo app Electron de verdade (helper concord-live, seletor
// do portal escolhido por hyprctl) e a bia assiste num Chromium; mede a CPU do
// helper e do Electron. CHROMIUM=1 repete a live pelo Chromium (motor desligado).
//
// Precisa: backend + LiveKit locais, `electron-vite build` com VITE_SERVER_URL
// (out/main, out/preload, out/renderer servido em APP), o helper em
// frontend/resources/linux/concord-live, sessão Hyprland (xdg-desktop-portal-hyprland).
// BACKEND_LOG: saída do backend sem SMTP (o link de confirmação do e-mail sai lá).
//   API=http://localhost:18080/api APP=http://localhost:5175/ BACKEND_LOG=backend.log SECONDS=30 node scripts/e2e-native-live.mjs
import { createRequire } from 'module'
import { execFileSync } from 'child_process'
import { mkdtempSync, readFileSync, readdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createE2E } from './lib/e2e.mjs'
const require = createRequire(new URL('../frontend/package.json', import.meta.url))
const { chromium, _electron } = require('playwright')

const API = process.env.API ?? 'http://localhost:18080/api'
const APP = process.env.APP ?? 'http://localhost:5175/'
const MEASURE_S = Number(process.env.SECONDS ?? 30)
const FRONTEND = new URL('../frontend/', import.meta.url).pathname
const run = Date.now().toString(36)
const { api, makeUser } = createE2E({ api: API, run })

function check(desc, ok, detail) {
  if (!ok) throw new Error(`FAIL ${desc}: ${JSON.stringify(detail)}`)
  console.log(`PASS ${desc}`)
}

async function waitFor(desc, fn, ok, timeout = 30000) {
  const start = Date.now()
  let last
  while (Date.now() - start < timeout) {
    last = await fn()
    if (ok(last)) { console.log(`PASS ${desc}:`, JSON.stringify(last)); return last }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`FAIL ${desc}: ${JSON.stringify(last)}`)
}

/** Escolhe a primeira tela no seletor do xdg-desktop-portal-hyprland. */
async function pickPortalScreen() {
  const picker = () => JSON.parse(execFileSync('hyprctl', ['clients', '-j'], { encoding: 'utf8' }))
    .find((c) => c.class === 'hyprland-share-picker')?.address
  const address = await waitFor('seletor do portal abriu', picker, Boolean, 20000)
  const dispatch = (lua) => execFileSync('hyprctl', ['dispatch', lua])
  for (let attempt = 0; attempt < 3 && picker() === address; attempt++) {
    await new Promise((r) => setTimeout(r, 1000))
    dispatch(`hl.dsp.focus({ window = 'address:${address}' })`)
    for (const key of ['Tab', 'space', 'Return']) {
      if (picker() !== address) break
      dispatch(`hl.dsp.send_shortcut({ mods = '', key = '${key}', window = 'address:${address}' })`)
      await new Promise((r) => setTimeout(r, 700))
    }
  }
}

const ticks = () => {
  const [user, nice, system] = readFileSync('/proc/stat', 'utf8').split('\n')[0].split(/\s+/).slice(1).map(Number)
  return user + nice + system
}
const procTicks = (pid) => {
  try {
    const fields = readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1].split(' ')
    return Number(fields[11]) + Number(fields[12])
  } catch {
    return 0
  }
}
/** O helper (o executável, não um shell que cite o caminho). */
const isHelper = (cmd) => cmd.split(' ')[0].endsWith('resources/linux/concord-live')
/** Processos cujo comando casa com o filtro. */
const pidsOf = (match) => readdirSync('/proc').filter((p) => /^\d+$/.test(p)).filter((pid) => {
  try {
    return match(readFileSync(`/proc/${pid}/cmdline`, 'utf8').replaceAll('\0', ' '))
  } catch {
    return false
  }
})

/** CPU média (% de um núcleo) dos processos no intervalo, e a do sistema inteiro. */
async function measureCpu(desc, match) {
  const pids = pidsOf(match)
  const hz = 100
  const before = new Map(pids.map((p) => [p, procTicks(p)]))
  const sysBefore = ticks()
  await new Promise((r) => setTimeout(r, MEASURE_S * 1000))
  const used = pids.reduce((sum, p) => sum + (procTicks(p) - (before.get(p) ?? 0)), 0)
  const sysUsed = ticks() - sysBefore
  const result = {
    desc,
    processos: pids.length,
    cpu_pct_de_um_nucleo: Math.round((used / hz / MEASURE_S) * 1000) / 10,
    cpu_pct_sistema_todo: Math.round((sysUsed / hz / MEASURE_S) * 1000) / 10
  }
  console.log('CPU', JSON.stringify(result))
  return result
}

const ana = await makeUser('ana')
const bia = await makeUser('bia')
const server = await api('/servers', { token: ana.token, method: 'POST', body: { name: `E2E ${run}` } })
const serverId = server.id ?? server.server?.id
await api(`/servers/${serverId}/channels`, { token: ana.token, method: 'POST', body: { name: 'voz-e2e', type: 'voice' } })
await api('/friends/request', { token: ana.token, method: 'POST', body: { username: bia.username } })
await api(`/friends/${ana.username}/accept`, { token: bia.token, method: 'PUT' })
await api(`/servers/${serverId}/invite`, { token: ana.token, method: 'POST', body: { user_id: bia.id } })
const invites = await api('/invites', { token: bia.token })
const invite = (Array.isArray(invites) ? invites : invites.invites).find((i) => (i.server_id ?? i.server?.id) === serverId)
await api(`/invites/${invite.id}/accept`, { token: bia.token, method: 'POST' })
console.log('setup ok', { serverId })

async function login(page, user) {
  await page.fill('input[autocomplete=username]', user.email)
  await page.fill('input[type=password]', user.password)
  await page.click('button[type=submit]')
  await page.getByText('Adicionar amigo').first().waitFor({ timeout: 30000 })
}

// Electron com dados próprios (não mexe na Salinha instalada).
const electronApp = await _electron.launch({
  executablePath: require('electron'),
  // Como o app instalado no Linux (salinha-launcher): Wayland nativo quando houver.
  args: ['--ozone-platform-hint=auto', FRONTEND],
  cwd: FRONTEND,
  env: { ...process.env, XDG_CONFIG_HOME: mkdtempSync(join(tmpdir(), 'salinha-e2e-')) }
})
const pageA = await electronApp.firstWindow()
pageA.on('console', (m) => { if (m.type() === 'error') console.log('[ana] console:', m.text()) })
await pageA.waitForLoadState()
await login(pageA, ana)
await pageA.evaluate((id) => { location.hash = `#/servers/${id}` }, serverId)
await pageA.getByText('voz-e2e', { exact: true }).first().click()

const browser = await chromium.launch({
  executablePath: process.env.CHROME,
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required']
})
const contextB = await browser.newContext({ permissions: ['microphone', 'camera'], viewport: { width: 1920, height: 1080 } })
const pageB = await contextB.newPage()
await pageB.goto(APP + '#/login')
await login(pageB, bia)
await pageB.goto(APP + `#/servers/${serverId}`)
await pageB.getByText('voz-e2e', { exact: true }).first().click()

const remoteVideo = () => pageB.evaluate(() =>
  [...document.querySelectorAll('video')].flatMap((el) =>
    el.srcObject ? el.srcObject.getVideoTracks().map(() => ({ w: el.videoWidth, h: el.videoHeight, t: el.currentTime })) : []))
const inbound = () => pageB.evaluate(async () => {
  // O painel de estatísticas lê o mesmo getStats(); aqui direto do <video>.
  const video = [...document.querySelectorAll('video')].find((el) => el.videoWidth > 0)
  return video ? { w: video.videoWidth, h: video.videoHeight, frames: video.getVideoPlaybackQuality().totalVideoFrames } : null
})

async function startShare(native) {
  await pageA.getByRole('button', { name: 'Compartilhar tela' }).first().click()
  const toggle = pageA.getByRole('switch', { name: 'Transmitir pelo motor nativo (beta)' })
  await toggle.waitFor({ timeout: 10000 })
  if ((await toggle.getAttribute('aria-checked')) !== String(native)) await toggle.click()
  await pageA.getByRole('button', { name: 'Escolher tela' }).click()
  await pickPortalScreen()
}

async function stopShare() {
  await pageA.getByRole('button', { name: /Parar (de )?(compartilhar|transmitir)/i }).first().click()
}

let failed = false
const results = []
async function nativeRound() {
  await startShare(true)
  await waitFor('helper publicando (ana:screen na sala)', () =>
    pidsOf(isHelper).length, (n) => n > 0)
  await pageB.getByRole('button', { name: 'Assistir transmissão' }).click({ timeout: 30000 })
  const first = await waitFor('bia vê a live nativa da ana', inbound, (v) => v && v.w >= 1280 && v.frames > 30)
  await new Promise((r) => setTimeout(r, 3000))
  const later = await inbound()
  check('a live nativa continua andando', later.frames > first.frames, { first, later })
  check('a ana vê a própria prévia', await pageA.evaluate(() => [...document.querySelectorAll('video')].some((v) => v.videoWidth > 0)), null)
  results.push(await measureCpu('helper concord-live (1080p30, H.264 VAAPI)', isHelper))
  results.push(await measureCpu('Electron da ana (sem codificar a live)', isAnaElectron))
  await stopShare()
  await waitFor('helper saiu', () => pidsOf(isHelper).length, (n) => n === 0)
}

/** A mesma live pelo Chromium (motor desligado). */
async function chromiumRound() {
  await startShare(false)
  await pageB.getByRole('button', { name: 'Assistir transmissão' }).click({ timeout: 30000 }).catch(() => {})
  await waitFor('bia vê a live da ana pelo Chromium', inbound, (v) => v && v.w >= 1280 && v.frames > 30)
  results.push(await measureCpu('Electron da ana (live pelo Chromium, 1080p30)', isAnaElectron))
  await stopShare()
}

const isAnaElectron = (cmd) => cmd.includes('electron') && cmd.includes(FRONTEND.replace(/\/$/, ''))

try {
  await nativeRound()
  // CHROMIUM=1: também a live pelo Chromium, para comparar a CPU. No Hyprland o
  // Electron abre o seletor do portal duas vezes e a captura pode não chegar.
  if (process.env.CHROMIUM === '1') await chromiumRound()
} catch (error) {
  failed = true
  console.error(error)
  await pageA.screenshot({ path: join(tmpdir(), 'e2e-native-ana.png') }).catch(() => {})
  await pageB.screenshot({ path: join(tmpdir(), 'e2e-native-bia.png') }).catch(() => {})
} finally {
  console.log('RESULTADOS', JSON.stringify(results))
  await electronApp.close().catch(() => {})
  await browser.close()
}
process.exit(failed ? 1 : 0)
