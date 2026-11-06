// E2E: quem é movido de canal de voz por um moderador entra de fato no canal
// novo (issue #368), sem clicar em nada. Três clientes (Chromium, mídia fake,
// cada um com um tom diferente como microfone) num servidor com dois canais de
// voz. O script confere, pelo som que chega de verdade em cada navegador:
//   1. a bia, sozinha na sala-a, é movida para a sala-b, onde está a ana: as
//      duas se ouvem (a chamada antiga acabou com a saída dela);
//   2. a bia, mutada, é movida da sala-b (a ana fica lá) para a sala-a, onde
//      está o caio: ela ouve o caio, continua mutada, e a ana para de ouvi-la.
//
// Precisa de backend + LiveKit locais e do renderer buildado com
// VITE_SERVER_URL apontando para o backend (o /rtc do backend leva ao LiveKit),
// como em scripts/e2e-voice.mjs:
// BACKEND_LOG é a saída do backend (sem SMTP o e-mail de confirmação sai lá):
//   API=http://127.0.0.1:18190/api APP=http://localhost:5274/ BACKEND_LOG=backend.log \
//     node scripts/e2e-mover-call.mjs
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

const ana = await makeUser('ana') // dona do servidor: pode mover
const bia = await makeUser('bia')
const caio = await makeUser('caio')
const server = await api('/servers', { token: ana.token, method: 'POST', body: { name: `E2E ${run}` } })
const serverId = server.id ?? server.server?.id
const voice = async (name) => {
  const ch = await api(`/servers/${serverId}/channels`, {
    token: ana.token, method: 'POST', body: { name, type: 'voice' }
  })
  return ch.id ?? ch.channel?.id
}
const salaA = await voice('sala-a')
const salaB = await voice('sala-b')
for (const u of [bia, caio]) {
  await api('/friends/request', { token: ana.token, method: 'POST', body: { username: u.username } })
  await api(`/friends/${ana.username}/accept`, { token: u.token, method: 'PUT' })
  await api(`/servers/${serverId}/invite`, { token: ana.token, method: 'POST', body: { user_id: u.id } })
  const invites = await api('/invites', { token: u.token })
  const invite = (Array.isArray(invites) ? invites : invites.invites).find((i) => (i.server_id ?? i.server?.id) === serverId)
  await api(`/invites/${invite.id}/accept`, { token: u.token, method: 'POST' })
}
console.log('setup ok', { serverId, salaA, salaB })

// Um navegador por pessoa: cada uma "fala" num tom próprio.
const TONES = { ana: 440, bia: 660, caio: 880 }
const browsers = []

async function openClient(user) {
  const tone = join(tmpdir(), `concord-e2e-mover-${user.name}.wav`)
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
  await page.goto(APP + '#/login')
  await page.fill('input[autocomplete=username]', user.email)
  await page.fill('input[type=password]', user.password)
  await page.click('button[type=submit]')
  await page.waitForURL((u) => !u.hash.includes('login'))
  await page.getByText('Adicionar amigo').first().waitFor({ timeout: 30000 })
  await page.goto(APP + `#/servers/${serverId}`)
  return page
}

const joinVoice = (page, name) => page.getByText(name, { exact: true }).first().click()

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

const move = (user, channelId) =>
  api('/calls/move', { token: ana.token, method: 'POST', body: { user_id: user.id, channel_id: channelId } })

let failed = false
try {
  const pageA = await openClient(ana)
  const pageB = await openClient(bia)
  const pageC = await openClient(caio)

  // 1. Movida estando sozinha: a chamada antiga acaba com a saída dela.
  await joinVoice(pageB, 'sala-a')
  await joinVoice(pageA, 'sala-b')
  await pageB.getByRole('button', { name: 'Desconectar', exact: true }).first().waitFor({ timeout: 20000 })
  await pageA.getByRole('button', { name: 'Desconectar', exact: true }).first().waitFor({ timeout: 20000 })
  await pageB.waitForTimeout(2000)
  await move(bia, salaB)
  await waitFor('sozinha → sala-b: ana ouve a bia', () => heardTones(pageA), hears('bia'))
  await waitFor('sozinha → sala-b: bia ouve a ana', () => heardTones(pageB), hears('ana'))

  // 2. Movida mutada, deixando a ana na sala antiga.
  await joinVoice(pageC, 'sala-a')
  await pageC.getByRole('button', { name: 'Desconectar', exact: true }).first().waitFor({ timeout: 20000 })
  await pageB.getByRole('button', { name: 'Silenciar Microfone' }).first().click()
  await pageB.waitForTimeout(1000)
  await move(bia, salaA)
  await waitFor('mutada → sala-a: bia ouve o caio', () => heardTones(pageB), hears('caio'))
  await waitFor('mutada → sala-a: ana para de ouvir a bia', () => heardTones(pageA), (p) => !hears('bia')(p))
  await waitFor('mutada → sala-a: bia continua mutada', () =>
    pageB.getByRole('button', { name: 'Ativar Microfone' }).count(), (n) => n > 0)
  await waitFor('mutada → sala-a: caio não ouve a bia (mutada)', () => heardTones(pageC), (p) => !hears('bia')(p))
  await pageB.getByRole('button', { name: 'Ativar Microfone' }).first().click()
  await waitFor('bia desmuta na sala-a: caio ouve a bia', () => heardTones(pageC), hears('bia'))
} catch (err) {
  failed = true
  console.error(err.message)
} finally {
  for (const b of browsers) await b.close()
}
process.exit(failed ? 1 : 0)
