// Uso: backend + LiveKit rodando, renderer buildado com VITE_SERVER_URL e
// servido em APP (ex.: python3 -m http.server 5174 em frontend/out/renderer).
//   API=http://localhost:8080/api APP=http://localhost:5174/ BACKEND_LOG=<saída do backend> \
//     node scripts/e2e-voice.mjs
// E2E: dois clientes (Chromium, mídia fake) entram no mesmo canal de voz via
// backend + LiveKit locais; um compartilha a tela. Verifica áudio e tela remotos.
import { createRequire } from 'module'
import { createE2E, writeToneWav } from './lib/e2e.mjs'
const require = createRequire(new URL('../frontend/package.json', import.meta.url))
const { chromium } = require('playwright')
const { tmpdir } = require('os')
const { join } = require('path')

// Tom contínuo como "microfone": o bipe padrão do Chromium é curto demais
// para a detecção de fala do LiveKit.
const TONE = join(tmpdir(), 'concord-e2e-tone.wav')
writeToneWav(TONE, { tremolo: 0.4 })

const API = process.env.API ?? 'http://localhost:8080/api'
const APP = process.env.APP ?? 'http://localhost:5174/'
const run = Date.now().toString(36)
const { api, makeUser } = createE2E({ api: API, run })

const ana = await makeUser('ana')
const bia = await makeUser('bia')
await api('/friends/request', { token: ana.token, method: 'POST', body: { username: bia.username } })
await api(`/friends/${ana.username}/accept`, { token: bia.token, method: 'PUT' })
const server = await api('/servers', { token: ana.token, method: 'POST', body: { name: `E2E ${run}` } })
const serverId = server.id ?? server.server?.id
const channel = await api(`/servers/${serverId}/channels`, {
  token: ana.token, method: 'POST', body: { name: 'voz-e2e', type: 'voice' }
})
const channelId = channel.id ?? channel.channel?.id
await api(`/servers/${serverId}/invite`, { token: ana.token, method: 'POST', body: { user_id: bia.id } })
const invites = await api('/invites', { token: bia.token })
const invite = (Array.isArray(invites) ? invites : invites.invites).find((i) => (i.server_id ?? i.server?.id) === serverId)
await api(`/invites/${invite.id}/accept`, { token: bia.token, method: 'POST' })
console.log('setup ok', { serverId, channelId })

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

// Simula o Electron no Windows para o fluxo do som da janela: o seletor do
// app (api.screenPicker) e o processo main entregando o MessagePort com PCM do
// helper — de propósito DEPOIS do vídeo (canais sem ordem garantida).
function fakeElectronWindowAudio() {
  window.electron = { process: { platform: 'win32' } }
  const showListeners = []
  let pick = null
  const thumb = 'data:image/gif;base64,R0lGODlhAQABAAAAACw='
  window.api = {
    screenPicker: {
      onShow: (cb) => { showListeners.push(cb); return () => {} },
      listSources: async () => [
        { id: 'screen:0:0', name: 'Tela inteira', thumbnail: thumb, appIcon: null, displayId: '0' },
        { id: 'window:4242:0', name: 'Jogo', thumbnail: thumb, appIcon: null, displayId: '' }
      ],
      select: (id) => pick?.(id),
      cancel: () => pick?.(null)
    },
    screenAudio: { stop: () => { window.__screenAudioStops = (window.__screenAudioStops ?? 0) + 1 } }
  }
  const original = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices)
  navigator.mediaDevices.getDisplayMedia = (constraints) => new Promise((resolve, reject) => {
    pick = async (id) => {
      if (!id) return reject(new DOMException('cancelado', 'NotAllowedError'))
      resolve(await original(constraints))
      if (!id.startsWith('window:')) return
      setTimeout(() => {
        const channel = new MessageChannel()
        let t = 0
        setInterval(() => {
          const frames = 960 // 20 ms a 48 kHz, tom de 1 kHz
          const pcm = new Float32Array(frames * 2)
          for (let i = 0; i < frames; i++, t++) {
            const v = 0.4 * Math.sin((2 * Math.PI * 1000 * t) / 48000)
            pcm[i * 2] = v
            pcm[i * 2 + 1] = v
          }
          channel.port1.postMessage(pcm.buffer, [pcm.buffer])
        }, 20)
        window.postMessage('concord:screen-audio-port', '*', [channel.port2])
      }, 300)
    }
    showListeners.forEach((cb) => cb())
  })
}

async function openClient(user, initScript) {
  const context = await browser.newContext({
    permissions: ['microphone', 'camera'],
    viewport: { width: 2560, height: 1440 }
  })
  const page = await context.newPage()
  if (initScript) await page.addInitScript(initScript)
  page.on('response', (r) => { if (r.status() === 404) console.log(`[${user.username}] 404:`, r.url()) })
  page.on('console', (m) => { if (m.type() === 'error') console.log(`[${user.username}] console:`, m.text()) })
  await page.goto(APP + '#/login')
  await page.fill('input[autocomplete=username]', user.email)
  await page.fill('input[type=password]', user.password)
  await page.click('button[type=submit]')
  await page.waitForURL((u) => !u.hash.includes('login'))
  // O app ainda navega para a home após o login; espera ela renderizar para a
  // navegação abaixo não ser sobrescrita (com latência de túnel isso demora).
  await page.getByText('Adicionar amigo').first().waitFor({ timeout: 30000 })
  await page.goto(APP + `#/servers/${serverId}`)
  await page.getByText('voz-e2e', { exact: true }).first().click()
  return page
}

const audioTracks = (page) => page.evaluate(() =>
  [...document.querySelectorAll('audio')].flatMap((el) =>
    el.srcObject ? el.srcObject.getAudioTracks().map((t) => t.readyState) : []))
const videoTracks = (page) => page.evaluate(() =>
  [...document.querySelectorAll('video')].flatMap((el) =>
    el.srcObject ? el.srcObject.getVideoTracks().map((t) => `${t.readyState}:${el.videoWidth}x${el.videoHeight}`) : []))

function check(desc, ok, detail) {
  if (!ok) throw new Error(`FAIL ${desc}: ${JSON.stringify(detail)}`)
  console.log(`PASS ${desc}`)
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

let failed = false
try {
  const pageA = await openClient(ana, fakeElectronWindowAudio)
  const pageB = await openClient(bia)

  await waitFor('ana ouve a bia', () => audioTracks(pageA), (t) => t.includes('live'))
  await waitFor('bia ouve a ana', () => audioTracks(pageB), (t) => t.includes('live'))
  // O microfone fake emite um bipe: o próprio usuário fica verde na lista do canal.
  // Seu nome fica em negrito na lista (sem o "(você)").
  await waitFor('ana se vê falando (verde na lista do canal)', () => pageA.evaluate(() =>
    [...document.querySelectorAll('span.font-bold')].some((el) =>
      el.textContent === 'ana' &&
      el.previousElementSibling?.className.includes('ring-[#23a55a]'))), (ok) => ok === true)

  // Mudo/ensurdecido aparece ao lado do nome para os outros (como no Discord).
  const voiceIcons = (page, name) => page.evaluate((n) => {
    const row = [...document.querySelectorAll('span')].find((el) => el.textContent === n)?.parentElement
    // O nome também tem title; os ícones ficam no fim da linha.
    const icons = row?.querySelector('span.ml-auto [title]')
    return icons ? icons.getAttribute('title') : 'nenhum'
  }, name)
  await pageA.getByRole('button', { name: 'Silenciar Microfone' }).first().click()
  await waitFor('bia vê a ana mutada', () => voiceIcons(pageB, 'ana'), (t) => t === 'Microfone desativado')
  await pageA.getByRole('button', { name: 'Silenciar Audio' }).first().click()
  await waitFor('bia vê a ana ensurdecida', () => voiceIcons(pageB, 'ana'), (t) => t === 'Áudio e microfone desativados')
  // Como no Discord: sair do ensurdecer volta ao mute de antes (ela estava mutada).
  await pageA.getByRole('button', { name: 'Ativar Audio' }).first().click()
  await waitFor('bia vê a ana de volta só mutada', () => voiceIcons(pageB, 'ana'), (t) => t === 'Microfone desativado')
  await pageA.getByRole('button', { name: 'Ativar Microfone' }).first().click()
  await waitFor('bia vê a ana com som de novo', () => voiceIcons(pageB, 'ana'), (t) => t === 'nenhum')

  // Botão direito na Bia: volume e silenciar só para a Ana.
  const biaVolumeOnA = () => pageA.evaluate(() =>
    [...document.querySelectorAll('audio')].filter((el) => el.srcObject?.getAudioTracks().length).map((el) => el.volume))
  await pageA.getByText('bia', { exact: true }).first().click({ button: 'right' })
  await pageA.getByRole('menu', { name: 'Opções de bia' }).waitFor()
  await pageA.getByLabel('Volume do usuário').fill('30')
  await waitFor('ana baixa a bia para 30%', biaVolumeOnA, (v) => v.length > 0 && v.every((x) => Math.abs(x - 0.3) < 0.01))
  await pageA.getByRole('menu', { name: 'Opções de bia' }).getByText('Silenciar').click()
  await waitFor('ana silencia a bia (só para ela)', biaVolumeOnA, (v) => v.every((x) => x === 0))
  await waitFor('ícone "silenciado por você" aparece para a ana', () =>
    pageA.locator('[title="Silenciado por você"]').count(), (n) => n > 0)
  check('a bia não vê nada (é só para a ana)', (await pageB.locator('[title="Silenciado por você"]').count()) === 0)
  await pageA.getByRole('menu', { name: 'Opções de bia' }).getByText('Silenciar').click()
  await pageA.keyboard.press('Escape')
  await waitFor('ana volta a ouvir a bia (30%)', biaVolumeOnA, (v) => v.every((x) => Math.abs(x - 0.3) < 0.01))

  // Troca de microfone no meio da chamada (Configurações → Voz).
  await pageA.getByRole('button', { name: 'Configurações do usuário' }).first().click()
  await pageA.getByRole('button', { name: 'Voz e áudio', exact: true }).click()
  const micSelect = pageA.locator('label', { hasText: 'Microfone' }).locator('select')
  await micSelect.waitFor()
  const options = await waitFor('lista de microfones carregada', () =>
    micSelect.locator('option').allTextContents(), (o) => o.length > 1)
  const other = options.find((o) => o !== 'Padrão do sistema')
  if (!other) throw new Error(`sem microfone alternativo: ${JSON.stringify(options)}`)
  await micSelect.selectOption({ label: other })
  await pageA.screenshot({ path: join(tmpdir(), 'concord-e2e-settings.png') })
  await pageA.getByRole('button', { name: 'Fechar configurações' }).click()
  await pageA.waitForTimeout(1500)
  await waitFor(`ana continua falando após trocar para "${other}"`, () => pageA.evaluate(() =>
    [...document.querySelectorAll('span.font-bold')].some((el) =>
      el.textContent === 'ana' &&
      el.previousElementSibling?.className.includes('ring-[#23a55a]'))), (ok) => ok === true)
  await waitFor('bia continua ouvindo a ana', () => audioTracks(pageB), (t) => t.includes('live'))

  // Seletor do app: aba Aplicativos → a janela "Jogo".
  await pageA.getByRole('button', { name: 'Compartilhar tela' }).first().click()
  await pageA.getByRole('button', { name: 'Aplicativos' }).click()
  await pageA.getByRole('button', { name: 'Compartilhar', exact: true }).click()
  // A live só é baixada quando alguém assiste.
  await pageB.getByRole('button', { name: 'Assistir transmissão' }).click({ timeout: 20000 })
  await waitFor('bia recebe o som da janela como track separada', () => audioTracks(pageB), (t) => t.filter((s) => s === 'live').length >= 2)
  await waitFor('o som da janela chega com volume', () => pageB.evaluate(async () => {
    const ctx = new AudioContext()
    const levels = []
    for (const el of document.querySelectorAll('audio')) {
      if (!el.srcObject) continue
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 2048
      ctx.createMediaStreamSource(el.srcObject).connect(analyser)
      await new Promise((r) => setTimeout(r, 300))
      const bins = new Float32Array(analyser.frequencyBinCount)
      analyser.getFloatFrequencyData(bins)
      const hz = (i) => Math.round((i * ctx.sampleRate) / analyser.fftSize)
      let peak = 0
      bins.forEach((v, i) => { if (v > bins[peak]) peak = i })
      levels.push(hz(peak))
    }
    await ctx.close()
    return levels
  }), (peaks) => peaks.some((hz) => Math.abs(hz - 1000) < 60))
  // Botão direito na live da Ana: volume e silenciar só da transmissão.
  const volumesOnB = () => pageB.evaluate(() => Object.fromEntries(
    [...document.querySelectorAll('audio[data-audio]')].map((el) => [el.dataset.audio.startsWith('screen:') ? 'live' : 'voz', el.volume])))
  await pageB.locator('video').first().waitFor({ timeout: 20000 })
  await pageB.locator('video').first().click({ button: 'right' })
  await pageB.getByRole('menu', { name: 'Transmissão de ana' }).waitFor()
  await pageB.getByRole('menu', { name: 'Transmissão de ana' }).getByLabel('Volume da transmissão', { exact: true }).fill('20')
  await waitFor('bia baixa a live da ana para 20% (a voz dela continua 100%)', volumesOnB, (v) => Math.abs(v.live - 0.2) < 0.01 && v.voz === 1)
  await pageB.getByRole('menu', { name: 'Transmissão de ana' }).getByText('Silenciar transmissão').click()
  await waitFor('bia silencia a live da ana', volumesOnB, (v) => v.live === 0 && v.voz === 1)
  await waitFor('ícone de silenciado aparece na live', () => pageB.locator('[title="Silenciado por você"]').count(), (n) => n > 0)
  await pageB.getByRole('menu', { name: 'Transmissão de ana' }).getByText('Silenciar transmissão').click()
  await pageB.keyboard.press('Escape')
  await waitFor('bia volta a ouvir a live (20%)', volumesOnB, (v) => Math.abs(v.live - 0.2) < 0.01)

  await waitFor('bia vê a tela da ana', () => videoTracks(pageB), (t) => t.some((v) => v.startsWith('live:') && !v.endsWith(':0x0')))
  // A tela em foco ocupa o palco (encosta na largura ou na altura disponível).
  // Mede a imagem visível (descontando as faixas pretas do object-contain)
  // contra a área inteira da view de voz.
  await waitFor('tela em foco ocupa a área do palco', () => pageB.evaluate(() => {
    const videos = [...document.querySelectorAll('video')].filter((v) => v.videoWidth > 0)
    const video = videos.sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0]
    const area = video?.closest('.overflow-y-auto')
    if (!video || !area) return null
    const ar = video.videoWidth / video.videoHeight
    const box = video.getBoundingClientRect()
    const w = Math.min(box.width, box.height * ar)
    const a = area.getBoundingClientRect()
    return { w: +(w / a.width).toFixed(2), h: +((w / ar) / a.height).toFixed(2) }
  }), (r) => r !== null && (r.w >= 0.85 || r.h >= 0.7))

  await pageB.getByRole('button', { name: 'Compartilhar tela' }).first().click()
  await pageA.getByRole('button', { name: 'Assistir transmissão' }).click({ timeout: 20000 })
  await waitFor('ana vê a tela da bia (duas telas ao mesmo tempo)', () => videoTracks(pageA), (t) => t.filter((v) => v.startsWith('live:') && !v.endsWith(':0x0')).length >= 2)

  await pageA.screenshot({ path: '/tmp/concord-e2e-ana.png' })
  await pageB.getByRole('button', { name: 'Desconectar', exact: true }).click()
  await waitFor('ana para de ouvir a bia após ela sair', () => audioTracks(pageA), (t) => t.length === 0)

  // DM: ana liga para a bia, bia aceita, ambos se ouvem e a bia liga a câmera.
  await pageA.getByRole('button', { name: 'Desconectar', exact: true }).click()
  await waitFor('captura do som da janela encerrada ao sair', () =>
    pageA.evaluate(() => window.__screenAudioStops ?? 0), (n) => n >= 1)
  await pageA.goto(APP + `#/dm/${bia.id}`)
  await pageA.getByRole('button', { name: 'Iniciar chamada de voz' }).click()
  await pageB.getByRole('button', { name: 'Aceitar chamada' }).click({ timeout: 15000 })
  await waitFor('DM: ana ouve a bia', () => audioTracks(pageA), (t) => t.includes('live'))
  await waitFor('DM: bia ouve a ana', () => audioTracks(pageB), (t) => t.includes('live'))
  await pageB.getByRole('button', { name: 'Ligar câmera' }).first().click()
  await waitFor('DM: ana vê a câmera da bia', () => videoTracks(pageA), (t) => t.some((v) => v.startsWith('live:') && !v.endsWith(':0x0')))
  await pageA.getByRole('button', { name: 'Encerrar chamada' }).first().click()
  await waitFor('DM: bia sai da chamada quando a ana encerra', () => audioTracks(pageB), (t) => t.length === 0)
} catch (err) {
  failed = true
  console.error(err.message)
} finally {
  await browser.close()
}
process.exit(failed ? 1 : 0)
