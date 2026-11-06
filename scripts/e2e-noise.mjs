// E2E da supressão de ruído (RNNoise) com o app de verdade no Chromium.
// Uso: backend + LiveKit rodando, renderer buildado e servido em APP (ex.:
// python3 -m http.server 5174 em frontend/out/renderer).
//   API=http://localhost:8080/api APP=http://localhost:5174/ BACKEND_LOG=<saída do backend> \
//   NOISE_WAV=ruido.wav VOICE_WAV=voz-com-ruido.wav node scripts/e2e-noise.mjs
// NOISE_WAV: só ruído (ex.: ventilador); VOICE_WAV: voz + o mesmo ruído. Ambos
// 48 kHz 16 bits — scripts/rnnoise-offline.mjs ajuda a gerar/conferir.
// Verifica: 1) Teste do microfone (Configurações → Voz) com a supressão
// ligada/desligada; 2) a voz passa; 3) na chamada, quem ouve recebe o ruído
// só com a supressão desligada — e o toggle vale ao vivo, sem republicar.
import { createRequire } from 'module'
import { tmpdir } from 'os'
import { join } from 'path'
import { createE2E } from './lib/e2e.mjs'
const require = createRequire(new URL('../frontend/package.json', import.meta.url))
const { chromium } = require('playwright')

const API = process.env.API ?? 'http://localhost:8080/api'
const APP = process.env.APP ?? 'http://localhost:5174/'
const SHOTS = process.env.SHOTS ?? tmpdir()
const { NOISE_WAV, VOICE_WAV } = process.env
if (!NOISE_WAV || !VOICE_WAV) {
  console.error('defina NOISE_WAV e VOICE_WAV (veja o cabeçalho)')
  process.exit(1)
}
const run = Date.now().toString(36)
const { api, makeUser } = createE2E({ api: API, run })

const ana = await makeUser('ana')
const bia = await makeUser('bia')
await api('/friends/request', { token: ana.token, method: 'POST', body: { username: bia.username } })
await api(`/friends/${ana.username}/accept`, { token: bia.token, method: 'PUT' })
const server = await api('/servers', { token: ana.token, method: 'POST', body: { name: `Ruído ${run}` } })
const serverId = server.id ?? server.server?.id
const channel = await api(`/servers/${serverId}/channels`, {
  token: ana.token, method: 'POST', body: { name: 'voz-ruido', type: 'voice' }
})
await api(`/servers/${serverId}/invite`, { token: ana.token, method: 'POST', body: { user_id: bia.id } })
const invites = await api('/invites', { token: bia.token })
const invite = (Array.isArray(invites) ? invites : invites.invites).find((i) => (i.server_id ?? i.server?.id) === serverId)
await api(`/invites/${invite.id}/accept`, { token: bia.token, method: 'POST' })
console.log('setup ok', { serverId, channelId: channel.id ?? channel.channel?.id })

const launch = (wav) => chromium.launch({
  executablePath: process.env.CHROME,
  args: [
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    `--use-file-for-fake-audio-capture=${wav}`,
    '--autoplay-policy=no-user-gesture-required'
  ]
})

const consoleErrors = []
async function openClient(browser, user) {
  const context = await browser.newContext({ permissions: ['microphone'], viewport: { width: 1600, height: 1000 } })
  const page = await context.newPage()
  page.on('console', (m) => {
    if (m.type() === 'error') {
      consoleErrors.push(`[${user.username}] ${m.text()}`)
      console.log(`[${user.username}] console:`, m.text())
    }
  })
  await page.goto(APP + '#/login')
  await page.fill('input[autocomplete=username]', user.email)
  await page.fill('input[type=password]', user.password)
  await page.click('button[type=submit]')
  await page.waitForURL((u) => !u.hash.includes('login'))
  await page.getByText('Adicionar amigo').first().waitFor({ timeout: 30000 })
  return page
}

function check(desc, ok, detail) {
  if (!ok) throw new Error(`FAIL ${desc}: ${JSON.stringify(detail)}`)
  console.log(`PASS ${desc}:`, JSON.stringify(detail))
}

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

/** Lê o medidor do "Teste do microfone" por `ms` (média e pico, 0–100). */
const sampleMeter = (page, ms = 2500) => page.evaluate(async (ms) => {
  const meter = document.querySelector('[role=meter][aria-label="Nível do microfone"]')
  const values = []
  const end = performance.now() + ms
  while (performance.now() < end) {
    values.push(Number(meter.getAttribute('aria-valuenow')))
    await new Promise((r) => setTimeout(r, 50))
  }
  return { avg: Math.round(values.reduce((a, b) => a + b, 0) / values.length), max: Math.max(...values) }
}, ms)

const nsSwitch = (page) => page.getByRole('switch', { name: 'Supressão de ruído' })
async function setNoiseSuppression(page, on) {
  const sw = nsSwitch(page)
  if ((await sw.getAttribute('aria-checked')) !== String(on)) await sw.click()
  check(`supressão ${on ? 'ligada' : 'desligada'}`, (await sw.getAttribute('aria-checked')) === String(on), on)
  await page.waitForTimeout(1200) // o RNNoise reaprende o ruído / crossfade
}

/** Teste do microfone em Configurações → Voz. */
async function micTestInSettings(wav, label) {
  const browser = await launch(wav)
  try {
    const page = await openClient(browser, ana)
    await page.getByRole('button', { name: 'Configurações do usuário' }).first().click()
    await page.getByRole('button', { name: 'Testar' }).click()
    await page.waitForTimeout(1500)
    await setNoiseSuppression(page, false)
    const off = await sampleMeter(page)
    await setNoiseSuppression(page, true)
    const on = await sampleMeter(page)
    await page.screenshot({ path: join(SHOTS, `concord-e2e-noise-settings-${label}.png`) })
    check(`RNNoise carregou (${label})`, (await page.getByText('O RNNoise não carregou').count()) === 0, 'sem aviso')
    await page.getByRole('button', { name: 'Parar' }).click()
    return { off, on }
  } finally {
    await browser.close()
  }
}

/** RMS (dBFS) do áudio que a bia recebe da ana, medido por `ms`. */
const receivedFromAna = (page, anaId, ms = 2000) => page.evaluate(async ({ anaId, ms }) => {
  const el = document.querySelector(`audio[data-audio="${anaId}"]`)
  if (!el?.srcObject) return null
  const ctx = new AudioContext()
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 2048
  ctx.createMediaStreamSource(el.srcObject).connect(analyser)
  const buf = new Float32Array(analyser.fftSize)
  let sum = 0
  let n = 0
  const end = performance.now() + ms
  while (performance.now() < end) {
    analyser.getFloatTimeDomainData(buf)
    for (const v of buf) sum += v * v
    n += buf.length
    await new Promise((r) => setTimeout(r, 40))
  }
  await ctx.close()
  const trackId = el.srcObject.getAudioTracks()[0]?.id
  return { db: Math.round(10 * Math.log10(sum / n + 1e-12)), trackId }
}, { anaId, ms })

let failed = false
try {
  // 1) Só ruído: com o RNNoise o medidor tem que despencar.
  const noise = await micTestInSettings(NOISE_WAV, 'ruido')
  check('só ruído: desligado mostra o ventilador', noise.off.avg >= 30, noise)
  check('só ruído: ligado zera o ventilador (≥ 25 pontos ≈ 15 dB a menos)', noise.off.avg - noise.on.avg >= 25, noise)

  // 2) Voz + ruído: a voz continua passando com o RNNoise ligado.
  const voice = await micTestInSettings(VOICE_WAV, 'voz')
  check('voz + ruído: a voz passa com a supressão ligada', voice.on.max >= 45, voice)

  // 3) Chamada: a bia ouve a ana (mic só com ruído). Toggle ao vivo pelo painel.
  const browser = await launch(NOISE_WAV)
  try {
    const pageA = await openClient(browser, ana)
    const pageB = await openClient(browser, bia)
    for (const page of [pageA, pageB]) {
      await page.goto(APP + `#/servers/${serverId}`)
      await page.getByText('voz-ruido', { exact: true }).first().click()
    }
    await waitFor('bia recebe o áudio da ana', () => pageB.evaluate((id) =>
      document.querySelector(`audio[data-audio="${id}"]`)?.srcObject?.getAudioTracks()[0]?.readyState ?? null, ana.id),
    (s) => s === 'live')
    await pageA.waitForTimeout(2000)

    // Abre o popover pelo botão de ondas do painel "Voz conectada" e liga
    // (a supressão vem desligada por padrão).
    await pageA.getByRole('button', { name: 'Supressão de ruído' }).click()
    await pageA.getByRole('dialog', { name: 'Supressão de ruído' }).waitFor()
    await pageA.screenshot({ path: join(SHOTS, 'concord-e2e-noise-popover.png') })
    await setNoiseSuppression(pageA, true)
    await pageA.waitForTimeout(1500)
    const onBefore = await receivedFromAna(pageB, ana.id)
    await setNoiseSuppression(pageA, false)
    await pageA.waitForTimeout(1500)
    const off = await receivedFromAna(pageB, ana.id)
    await setNoiseSuppression(pageA, true)
    await pageA.waitForTimeout(1500)
    const onAfter = await receivedFromAna(pageB, ana.id)
    const result = { onBefore, off, onAfter }
    check('chamada: com a supressão a bia não ouve o ventilador', onBefore.db <= off.db - 15, result)
    check('chamada: desligar ao vivo faz o ruído chegar', off.db >= -45, result)
    check('chamada: religar ao vivo volta a cortar', onAfter.db <= off.db - 15, result)
    check('chamada: mesma track o tempo todo (sem republicar)',
      onBefore.trackId === off.trackId && off.trackId === onAfter.trackId, result)
    await pageA.keyboard.press('Escape')
    check('popover fecha com Esc', (await pageA.getByRole('dialog', { name: 'Supressão de ruído' }).count()) === 0, 'fechado')
    await pageA.getByRole('button', { name: 'Desconectar', exact: true }).click()
    await pageB.getByRole('button', { name: 'Desconectar', exact: true }).click()
  } finally {
    await browser.close()
  }
  const bad = consoleErrors.filter((e) => /Content Security Policy|WebAssembly|RNNoise/i.test(e))
  check('sem erro de CSP/WASM/RNNoise no console', bad.length === 0, bad)
} catch (err) {
  failed = true
  console.error(err.message)
}
process.exit(failed ? 1 : 0)
