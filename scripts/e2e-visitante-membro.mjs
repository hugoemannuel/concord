// E2E: quem está numa call como visitante (com conta) e aceita o convite do
// servidor continua na call, agora como membro, com um ícone só no trilho
// (docs/adr/0017-visitante-na-call.md, emenda "visitante que vira membro").
// Dois clientes (Chromium, mídia fake, cada um com um tom como microfone):
//   1. a ana (dona) está na call; a bia abre o link de visitante e entra:
//      as duas se ouvem, o trilho da bia mostra a visita e ela tranca e
//      destranca a sala (visitante pode, emenda de 2026-10-29);
//   2. a bia entra no servidor pelo código de convite: continua na call (a ana
//      segue ouvindo a bia), a visita some do trilho, o servidor aparece uma
//      vez só, a tela sai de /visitas/ e o backend já não a trata como visitante.
//
// Precisa de backend + LiveKit locais e do app web buildado com VITE_SERVER_URL
// apontando para o backend, como em scripts/e2e-mover-call.mjs:
//   API=http://127.0.0.1:18211/api APP=http://localhost:5291/ BACKEND_LOG=backend.log \
//     node scripts/e2e-visitante-membro.mjs
import { createRequire } from 'module'
import { createE2E, writeToneWav } from './lib/e2e.mjs'
const require = createRequire(new URL('../frontend/package.json', import.meta.url))
const { chromium } = require('playwright')
const { tmpdir } = require('os')
const { join } = require('path')

const API = process.env.API ?? 'http://localhost:8080/api'
const APP = process.env.APP ?? 'http://localhost:5174/'
const run = Date.now().toString(36)
const { api, makeUser } = createE2E({ api: API, run })

const ana = await makeUser('ana')
const bia = await makeUser('bia')
const serverName = `E2E ${run}`
const server = await api('/servers', { token: ana.token, method: 'POST', body: { name: serverName } })
const serverId = server.id ?? server.server?.id
const ch = await api(`/servers/${serverId}/channels`, {
  token: ana.token, method: 'POST', body: { name: 'resenha', type: 'voice' }
})
const channelId = ch.id ?? ch.channel?.id
console.log('setup ok', { serverId, channelId })

const TONES = { ana: 440, bia: 660 }
const browsers = []

async function openClient(user, path) {
  const tone = join(tmpdir(), `concord-e2e-visitante-${user.name}.wav`)
  writeToneWav(tone, { hz: TONES[user.name], seconds: 90 })
  const browser = await chromium.launch({
    executablePath: process.env.CHROME,
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      `--use-file-for-fake-audio-capture=${tone}`,
      '--autoplay-policy=no-user-gesture-required'
    ]
  })
  browsers.push(browser)
  const context = await browser.newContext({ permissions: ['microphone'], viewport: { width: 1280, height: 800 } })
  const page = await context.newPage()
  page.on('console', (m) => { if (m.type() === 'error') console.log(`[${user.name}] console:`, m.text()) })
  await page.goto(new URL('login', APP).href)
  await page.fill('input[autocomplete=username]', user.email)
  await page.fill('input[type=password]', user.password)
  await page.click('button[type=submit]')
  await page.waitForURL((u) => !u.pathname.includes('login'))
  await page.getByText('Adicionar amigo').first().waitFor({ timeout: 30000 })
  await page.goto(new URL(path.slice(1), APP).href)
  return page
}

const heardTones = (page) => page.evaluate(async () => {
  const ctx = new AudioContext()
  const peaks = []
  for (const el of document.querySelectorAll('audio')) {
    const stream = el.srcObject
    if (!stream || !stream.getAudioTracks().some((t) => t.readyState === 'live')) continue
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 4096
    ctx.createMediaStreamSource(stream).connect(analyser)
    await new Promise((r) => setTimeout(r, 400))
    const bins = new Float32Array(analyser.frequencyBinCount)
    analyser.getFloatFrequencyData(bins)
    let peak = 0
    bins.forEach((v, i) => { if (v > bins[peak]) peak = i })
    if (bins[peak] > -70) peaks.push(Math.round((peak * ctx.sampleRate) / analyser.fftSize))
  }
  await ctx.close()
  return peaks
})
const hears = (who) => (peaks) => peaks.some((hz) => Math.abs(hz - TONES[who]) < 30)

async function waitFor(desc, fn, ok, timeout = 20000) {
  const start = Date.now()
  let last
  while (Date.now() - start < timeout) {
    last = await fn()
    if (ok(last)) { console.log(`PASS ${desc}:`, JSON.stringify(last)); return last }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`FAIL ${desc}: ${JSON.stringify(last)}`)
}

/** Ícones do servidor no trilho da bia: como visitante e como membro. */
const railIcons = (page) => page.evaluate((name) => ({
  visit: document.querySelectorAll(`[aria-label="${name} (visitante)"]`).length,
  member: document.querySelectorAll(`[aria-label="${name}"]`).length
}), serverName)

/** A bia na call, pelo backend: está lá e se é visitante. */
async function biaInCall() {
  const states = await api(`/calls/active?scope=server&id=${serverId}`, { token: ana.token }).catch(() => [])
  const list = Array.isArray(states) ? states : states.calls ?? []
  const p = list.flatMap((s) => s.participants ?? []).find((x) => x.user_id === bia.id)
  return p ? { in: true, guest_of: p.guest_of ?? '' } : { in: false }
}

async function callLocked() {
  const states = await api(`/calls/active?scope=server&id=${serverId}`, { token: ana.token }).catch(() => [])
  return Boolean((Array.isArray(states) ? states : [])[0]?.call?.locked)
}

let failed = false
try {
  const pageA = await openClient(ana, `/servers/${serverId}`)
  await pageA.getByText('resenha', { exact: true }).first().click()
  await pageA.getByRole('button', { name: 'Desconectar', exact: true }).first().waitFor({ timeout: 20000 })

  const created = await api('/guest-invites', {
    token: ana.token, method: 'POST', body: { channel_id: channelId, duration: '2h', can_speak: true }
  })

  // 1. A bia entra como visitante com a conta.
  const pageB = await openClient(bia, `/visitante/${created.token}`)
  await pageB.getByRole('button', { name: 'Entrar na call' }).first().click()
  await pageB.getByRole('button', { name: 'Desconectar', exact: true }).first().waitFor({ timeout: 20000 })
  await waitFor('visitante: ana ouve a bia', () => heardTones(pageA), hears('bia'))
  await waitFor('visitante: bia ouve a ana', () => heardTones(pageB), hears('ana'))
  await waitFor('visitante: trilho com a visita', () => railIcons(pageB), (r) => r.visit === 1 && r.member === 0)
  await waitFor('visitante: backend diz visitante', biaInCall, (s) => s.in && s.guest_of === serverId)
  if (!pageB.url().includes('/visitas/')) throw new Error(`FAIL visitante abre /visitas/: ${pageB.url()}`)
  await pageB.getByRole('button', { name: 'Trancar sala' }).first().click()
  await waitFor('visitante tranca a sala', callLocked, (l) => l === true)
  await pageB.getByRole('button', { name: 'Destrancar sala' }).first().click()
  await waitFor('visitante destranca a sala', callLocked, (l) => l === false)

  // 2. A bia aceita o convite do servidor (código).
  const { code } = await api(`/servers/${serverId}/invite-code`, { token: ana.token })
  await api('/invites/join', { token: bia.token, method: 'POST', body: { code } })

  await waitFor('membro: um ícone só no trilho', () => railIcons(pageB), (r) => r.visit === 0 && r.member === 1)
  await waitFor('membro: a tela sai de /visitas/', () => pageB.url(), (u) => u.includes(`/servers/${serverId}/channels/${channelId}`))
  await waitFor('membro: backend tira o selo e mantém na call', biaInCall, (s) => s.in && s.guest_of === '')
  await pageB.getByRole('button', { name: 'Desconectar', exact: true }).first().waitFor({ timeout: 5000 })
  await pageA.waitForTimeout(3000)
  await waitFor('membro: ana continua ouvindo a bia', () => heardTones(pageA), hears('bia'))
  await waitFor('membro: bia continua ouvindo a ana', () => heardTones(pageB), hears('ana'))
  // O fluxo de visitante não vale mais para ela.
  const again = await api(`/guest-invites/${created.token}/join`, { token: bia.token, method: 'POST' })
    .then(() => 'aceitou').catch((e) => e.message)
  if (!again.includes('already_member')) throw new Error(`FAIL link de visitante sendo membro: ${again}`)
  console.log('PASS link de visitante sendo membro: already_member')
} catch (err) {
  failed = true
  console.error(err.message)
} finally {
  for (const b of browsers) await b.close()
}
process.exit(failed ? 1 : 0)
