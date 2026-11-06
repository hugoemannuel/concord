// E2E: silenciar e ensurdecer no servidor e liberar (issue #369). A pessoa
// liberada volta a falar e a ouvir na hora, sem clicar em nada. Três clientes
// (Chromium, mídia fake, cada um com um tom diferente como microfone) num canal
// de voz: a ana (dona, modera), a bia (alvo) e o caio (ouvinte). O script
// confere, pelo som que chega de verdade em cada navegador:
//   a) silenciar a bia: o caio para de ouvi-la; liberar: o caio volta a ouvi-la;
//   b) ensurdecer a bia: ela para de ouvir; liberar: ela volta a ouvir e a falar;
//   c) silenciar + ensurdecer juntos, liberando nas duas ordens;
//   d) a bia mutada por escolha antes continua mutada depois de liberada;
//   e) liberar com a aba da bia em segundo plano.
//
// Precisa de backend + LiveKit locais e do app web servido com o backend por
// trás (yarn dev:web com WEB_BACKEND_URL; rotas sem #, como no navegador).
// BACKEND_LOG é a saída do backend (sem SMTP o e-mail de confirmação sai lá).
// Com LK_URL/LK_KEY/LK_SECRET o script também mostra, a cada passo, as trilhas
// que a bia tem publicadas no LiveKit, e com SHOTS=<pasta>, prints da falha
// (diagnóstico):
//   API=http://127.0.0.1:18190/api APP=http://localhost:5274/ BACKEND_LOG=backend.log \
//     node scripts/e2e-silenciar-servidor.mjs
import { createRequire } from 'module'
import { createHmac } from 'crypto'
import { createE2E, writeToneWav } from './lib/e2e.mjs'
const require = createRequire(new URL('../frontend/package.json', import.meta.url))
const { chromium } = require('playwright')
const { tmpdir } = require('os')
const { join } = require('path')

const API = process.env.API ?? 'http://localhost:8080/api'
const APP = process.env.APP ?? 'http://localhost:5174/'
const run = Date.now().toString(36)
const { api, makeUser } = createE2E({ api: API, run })

// Diagnóstico: trilhas publicadas no LiveKit (RoomService/ListParticipants).
const b64url = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url')
async function liveKitTracks(room, identity) {
  const { LK_URL, LK_KEY, LK_SECRET } = process.env
  if (!LK_URL || !LK_KEY || !LK_SECRET) return null
  const now = Math.floor(Date.now() / 1000)
  const body = `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ iss: LK_KEY, nbf: now - 5, exp: now + 60, video: { roomAdmin: true, room } })}`
  const jwt = `${body}.${createHmac('sha256', LK_SECRET).update(body).digest('base64url')}`
  const res = await fetch(`${LK_URL}/twirp/livekit.RoomService/ListParticipants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
    body: JSON.stringify({ room })
  })
  const { participants = [] } = await res.json()
  const p = participants.find((x) => x.identity === identity)
  return p && {
    sources: p.permission?.canPublishSources,
    canSubscribe: p.permission?.canSubscribe,
    tracks: (p.tracks ?? []).map((t) => `${t.source ?? t.type}${t.muted ? ':mudo' : ''}`)
  }
}

const ana = await makeUser('ana') // dona do servidor: silencia e ensurdece
const bia = await makeUser('bia')
const caio = await makeUser('caio')
const server = await api('/servers', { token: ana.token, method: 'POST', body: { name: `E2E ${run}` } })
const serverId = server.id ?? server.server?.id
const ch = await api(`/servers/${serverId}/channels`, {
  token: ana.token, method: 'POST', body: { name: 'sala-voz', type: 'voice' }
})
const salaId = ch.id ?? ch.channel?.id
for (const u of [bia, caio]) {
  await api('/friends/request', { token: ana.token, method: 'POST', body: { username: u.username } })
  await api(`/friends/${ana.username}/accept`, { token: u.token, method: 'PUT' })
  await api(`/servers/${serverId}/invite`, { token: ana.token, method: 'POST', body: { user_id: u.id } })
  const invites = await api('/invites', { token: u.token })
  const invite = (Array.isArray(invites) ? invites : invites.invites).find((i) => (i.server_id ?? i.server?.id) === serverId)
  await api(`/invites/${invite.id}/accept`, { token: u.token, method: 'POST' })
}
console.log('setup ok', { serverId, salaId })

// Um navegador por pessoa: cada uma "fala" num tom próprio.
const TONES = { ana: 440, bia: 660, caio: 880 }
const browsers = []

async function openClient(user) {
  const tone = join(tmpdir(), `concord-e2e-silenciar-${user.name}.wav`)
  // Tom contínuo como microfone (com o DTX, silêncio não manda pacote).
  writeToneWav(tone, { hz: TONES[user.name], seconds: 60 })
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
  await page.goto(APP + 'login')
  await page.fill('input[autocomplete=username]', user.email)
  await page.fill('input[type=password]', user.password)
  await page.click('button[type=submit]')
  await page.waitForURL((u) => !u.href.includes('login'))
  await page.getByText('Adicionar amigo').first().waitFor({ timeout: 30000 })
  await page.goto(APP + `servers/${serverId}`)
  return page
}

/** Tons que chegam (frequência de pico de cada áudio remoto tocando). */
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
const notHears = (who) => (peaks) => !hears(who)(peaks)

async function waitFor(desc, fn, ok, timeout = 15000) {
  const start = Date.now()
  let last
  while (Date.now() - start < timeout) {
    last = await fn()
    if (ok(last)) { console.log(`PASS ${desc}:`, JSON.stringify(last)); return last }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`FAIL ${desc}: ${JSON.stringify(last)}`)
}

let failed = false
let callId
const step = async (desc, fn) => {
  try {
    await fn()
  } catch (err) {
    failed = true
    console.error(`${err.message}  (cenário: ${desc})`)
    if (callId) console.error('  livekit bia:', JSON.stringify(await liveKitTracks(callId, bia.id)))
  }
}
const serverMute = (muted) =>
  api(`/calls/${callId}/participants/${bia.id}/server-mute`, { token: ana.token, method: 'POST', body: { muted } })
const serverDeafen = (deafened) =>
  api(`/calls/${callId}/participants/${bia.id}/server-deafen`, { token: ana.token, method: 'POST', body: { deafened } })

try {
  const pageA = await openClient(ana)
  const pageB = await openClient(bia)
  const pageC = await openClient(caio)
  for (const page of [pageA, pageB, pageC]) {
    await page.getByText('sala-voz', { exact: true }).first().click()
    await page.getByRole('button', { name: 'Desconectar', exact: true }).first().waitFor({ timeout: 20000 })
  }
  const state = await api(`/calls/active?scope=channel&id=${salaId}`, { token: ana.token })
  callId = state.call?.id ?? state.id
  const micOn = () => pageB.getByRole('button', { name: 'Silenciar Microfone' }).count()
  const micOff = () => pageB.getByRole('button', { name: 'Ativar Microfone' }).count()
  // Ícone de "pelo moderador" que o caio vê ao lado da bia.
  const badge = (title) => () => pageC.locator(`[title="${title}"]`).count()

  await waitFor('início: caio ouve a bia', () => heardTones(pageC), hears('bia'))
  await waitFor('início: bia ouve o caio', () => heardTones(pageB), hears('caio'))

  await step('a) silenciar e liberar', async () => {
    await serverMute(true)
    await waitFor('a) silenciada: caio não ouve a bia', () => heardTones(pageC), notHears('bia'))
    await waitFor('a) silenciada: caio vê o ícone', badge('Silenciado por um moderador'), (n) => n > 0)
    await serverMute(false)
    await waitFor('a) liberada: caio volta a ouvir a bia', () => heardTones(pageC), hears('bia'))
    await waitFor('a) liberada: microfone da bia aberto na UI', micOn, (n) => n > 0)
    await waitFor('a) liberada: o ícone some para o caio', badge('Silenciado por um moderador'), (n) => n === 0)
  })

  await step('b) ensurdecer e liberar', async () => {
    await serverDeafen(true)
    await waitFor('b) ensurdecida: bia não ouve o caio', () => heardTones(pageB), notHears('caio'))
    await waitFor('b) ensurdecida: caio vê o ícone', badge('Ensurdecido por um moderador'), (n) => n > 0)
    await serverDeafen(false)
    await waitFor('b) liberada: bia volta a ouvir o caio', () => heardTones(pageB), hears('caio'))
    await waitFor('b) liberada: caio ouve a bia', () => heardTones(pageC), hears('bia'))
    await waitFor('b) liberada: o ícone some para o caio', badge('Ensurdecido por um moderador'), (n) => n === 0)
  })

  await step('c1) silenciar + ensurdecer, liberar silêncio e depois surdez', async () => {
    await serverMute(true)
    await serverDeafen(true)
    await waitFor('c1) caio não ouve a bia', () => heardTones(pageC), notHears('bia'))
    await serverMute(false)
    await serverDeafen(false)
    await waitFor('c1) liberada: caio ouve a bia', () => heardTones(pageC), hears('bia'))
    await waitFor('c1) liberada: bia ouve o caio', () => heardTones(pageB), hears('caio'))
  })

  await step('c2) silenciar + ensurdecer, liberar surdez e depois silêncio', async () => {
    await serverDeafen(true)
    await serverMute(true)
    await waitFor('c2) caio não ouve a bia', () => heardTones(pageC), notHears('bia'))
    await serverDeafen(false)
    await serverMute(false)
    await waitFor('c2) liberada: caio ouve a bia', () => heardTones(pageC), hears('bia'))
    await waitFor('c2) liberada: bia ouve o caio', () => heardTones(pageB), hears('caio'))
  })

  await step('d) mutada por escolha continua mutada', async () => {
    await pageB.getByRole('button', { name: 'Silenciar Microfone' }).first().click()
    await waitFor('d) bia mutou: caio não ouve a bia', () => heardTones(pageC), notHears('bia'))
    await serverMute(true)
    await pageB.waitForTimeout(1500)
    await serverMute(false)
    await pageB.waitForTimeout(2000)
    await waitFor('d) liberada: bia continua mutada na UI', micOff, (n) => n > 0)
    await waitFor('d) liberada: caio continua sem ouvir a bia', () => heardTones(pageC), notHears('bia'))
    await pageB.getByRole('button', { name: 'Ativar Microfone' }).first().click()
    await waitFor('d) bia desmuta: caio ouve a bia', () => heardTones(pageC), hears('bia'))
  })

  await step('e) liberar com a aba em segundo plano', async () => {
    await serverMute(true)
    await waitFor('e) silenciada: caio não ouve a bia', () => heardTones(pageC), notHears('bia'))
    // Outra aba na frente: a da bia fica oculta (visibilityState = hidden).
    const other = await pageB.context().newPage()
    await other.goto('about:blank')
    await other.bringToFront()
    await serverMute(false)
    await waitFor('e) liberada em segundo plano: caio ouve a bia', () => heardTones(pageC), hears('bia'))
    await other.close()
  })
} catch (err) {
  failed = true
  console.error(err.message)
  if (process.env.SHOTS) for (const [i, b] of browsers.entries()) await b.contexts()[0]?.pages()[0]?.screenshot({ path: join(process.env.SHOTS, `falha-${i}.png`) })
} finally {
  for (const b of browsers) await b.close()
}
console.log(failed ? 'RESULTADO: FAIL' : 'RESULTADO: PASS')
process.exit(failed ? 1 : 0)
