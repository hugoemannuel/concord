// Uso: backend com MUSIC_TEST_SOURCE=1 MUSIC_IDLE_TIMEOUT=5s, LiveKit e ffmpeg no
// PATH, renderer buildado com VITE_SERVER_URL e servido em APP.
//   API=http://localhost:8080/api APP=http://localhost:5174/ BACKEND_LOG=<saída do backend> \
//     node scripts/e2e-music.mjs
// E2E do Maestro: dois canais de voz tocando ao mesmo tempo, cada um com o seu
// player independente. Quatro clientes (Chrome, mídia fake) entram nas salas,
// pedem músicas com /play e /skip e conferem áudio, painel, mensagens públicas
// e a presença do bot (que some depois do tempo ocioso).
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
const { api, request, makeUser } = createE2E({ api: API, run })

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

let browser
let failed = false
try {
  // --- Setup: 4 usuários, 1 servidor, 2 salas de voz e 1 canal de texto ---
  const ana = await makeUser('ana')
  const bia = await makeUser('bia')
  const caio = await makeUser('caio')
  const davi = await makeUser('davi')

  const server = await api('/servers', { token: ana.token, method: 'POST', body: { name: `Musica ${run}` } })
  const serverId = server.id ?? server.server?.id
  const { code } = await api(`/servers/${serverId}/invite-code`, { token: ana.token })
  for (const u of [bia, caio, davi]) {
    await api('/invites/join', { token: u.token, method: 'POST', body: { code } })
  }
  const mkChannel = async (name, type) => {
    const ch = await api(`/servers/${serverId}/channels`, { token: ana.token, method: 'POST', body: { name, type } })
    return ch.id ?? ch.channel?.id
  }
  const sala1 = await mkChannel('Sala 1', 'voice')
  const sala2 = await mkChannel('Sala 2', 'voice')
  // Canal de texto: o primeiro do servidor (cria um se o servidor não veio com um).
  const channelList = async () => {
    const r = await api(`/servers/${serverId}/channels`, { token: ana.token })
    return Array.isArray(r) ? r : r.channels
  }
  let textChannel = (await channelList()).find((c) => (c.type ?? 'text') === 'text')?.id
  if (!textChannel) textChannel = await mkChannel('geral', 'text')
  console.log('setup ok', { serverId, sala1, sala2, textChannel })

  // O Maestro entra como membro-bot do servidor.
  const detail = await api(`/servers/${serverId}`, { token: ana.token })
  check('o servidor tem um membro bot (Maestro)', (detail.members ?? []).some((m) => m.is_bot === true),
    (detail.members ?? []).map((m) => ({ u: m.username, bot: m.is_bot })))

  // --- 4 clientes ---
  browser = await chromium.launch({
    channel: process.env.CHROME ? undefined : 'chrome',
    executablePath: process.env.CHROME,
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      `--use-file-for-fake-audio-capture=${TONE}`,
      '--autoplay-policy=no-user-gesture-required'
    ]
  })

  async function openClient(user, roomName) {
    const context = await browser.newContext({
      permissions: ['microphone', 'camera'],
      viewport: { width: 1920, height: 1080 }
    })
    const page = await context.newPage()
    page.on('response', (r) => { if (r.status() === 404) console.log(`[${user.username}] 404:`, r.url()) })
    page.on('console', (m) => { if (m.type() === 'error') console.log(`[${user.username}] console:`, m.text()) })
    await page.goto(APP + '#/login')
    await page.fill('input[type=email]', user.email)
    await page.fill('input[type=password]', user.password)
    await page.click('button[type=submit]')
    await page.waitForURL((u) => !u.hash.includes('login'))
    await page.getByText('Adicionar amigo').first().waitFor({ timeout: 30000 })
    await page.goto(APP + `#/servers/${serverId}`)
    await page.getByText(roomName, { exact: true }).first().click()
    return page
  }

  const pageA = await openClient(ana, 'Sala 1')
  const pageB = await openClient(bia, 'Sala 1')
  const pageC = await openClient(caio, 'Sala 2')
  const pageD = await openClient(davi, 'Sala 2')

  const audioTracks = (page) => page.evaluate(() =>
    [...document.querySelectorAll('audio')].flatMap((el) =>
      el.srcObject ? el.srcObject.getAudioTracks().map((t) => t.readyState) : []))
  await waitFor('ana e bia se ouvem na Sala 1', () => audioTracks(pageB), (t) => t.includes('live'))
  await waitFor('caio e davi se ouvem na Sala 2', () => audioTracks(pageD), (t) => t.includes('live'))

  // --- /play nas duas salas: respondem 202 {command:true} ---
  const say = (user, content) => request(`/channels/${textChannel}/messages`, {
    token: user.token, method: 'POST', body: { content }
  })
  const play1 = await say(ana, '/play https://youtu.be/sala1tom001')
  check('/play da ana responde 202 {command:true}', play1.status === 202 && play1.body?.command === true, play1)
  const play2 = await say(caio, '/play https://youtu.be/sala2tom001')
  check('/play do caio responde 202 {command:true}', play2.status === 202 && play2.body?.command === true, play2)

  // --- O Maestro aparece no palco e o áudio dele chega estéreo ---
  const maestroTile = (page) => page.evaluate(() => {
    const body = document.body.innerText
    return { maestro: body.includes('Maestro'), tag: /\bBOT\b/.test(body) }
  })
  const botAudio = (page, room) => page.evaluate((id) => {
    const el = document.querySelector(`audio[data-audio="bot-music:${id}"]`)
    const tracks = el?.srcObject ? el.srcObject.getAudioTracks() : []
    if (!tracks.length) return null
    return { state: tracks[0].readyState, channelCount: tracks[0].getSettings?.().channelCount ?? null }
  }, room)

  for (const [name, page, room] of [['bia', pageB, sala1], ['davi', pageD, sala2]]) {
    await waitFor(`${name} vê o tile do Maestro com a tag BOT`, () => maestroTile(page), (r) => r.maestro && r.tag, 15000)
    const a = await waitFor(`${name} recebe o áudio bot-music:<sala>`, () => botAudio(page, room), (r) => r !== null && r.state === 'live', 15000)
    console.log(`INFO ${name}: channelCount da track do Maestro =`, a.channelCount)
    if (a.channelCount !== null) check(`${name}: áudio do Maestro é estéreo`, a.channelCount === 2, a)
  }
  // Players independentes: a Sala 1 não ouve o player da Sala 2 e vice-versa.
  check('bia não recebe o player da Sala 2', (await botAudio(pageB, sala2)) === null)
  check('davi não recebe o player da Sala 1', (await botAudio(pageD, sala1)) === null)

  // --- Presença ---
  const presence = await api(`/servers/${serverId}/music/presence`, { token: ana.token })
  const ids = presence.channel_ids ?? []
  check('presença lista as duas salas', ids.includes(sala1) && ids.includes(sala2), presence)

  // --- Fila e /skip na Sala 1 ---
  const recentMessages = async () => {
    const r = await api(`/channels/${textChannel}/messages`, { token: ana.token })
    return (Array.isArray(r) ? r : r.messages ?? []).map((m) => m.content ?? '')
  }
  const play3 = await say(ana, '/play https://youtu.be/sala1tom002')
  check('segundo /play da ana responde 202', play3.status === 202, play3)
  await waitFor('mensagem pública com "posição 1"', recentMessages, (msgs) => msgs.some((m) => m.includes('posição 1')), 10000)

  const skip = await say(ana, '/skip')
  check('/skip da ana responde 202', skip.status === 202, skip)
  await waitFor('mensagem pública "foi pulada por @ana"', recentMessages,
    (msgs) => msgs.some((m) => m.includes(`foi pulada por @${ana.username}`)), 10000)
  await waitFor('painel da bia mostra a segunda música (sala1tom002)',
    () => pageB.evaluate(() => document.querySelector('[data-testid="music-now-title"]')?.textContent ?? null),
    (t) => t !== null && t.includes('sala1tom002') && !t.includes('sala1tom001'), 3000)

  // --- Fim das faixas + timeout ocioso: a presença da Sala 1 some ---
  await waitFor('a presença da Sala 1 some depois do fim da fila e do timeout',
    async () => (await api(`/servers/${serverId}/music/presence`, { token: ana.token })).channel_ids ?? [],
    (list) => !list.includes(sala1), 60000)
  console.log('OK')
} catch (err) {
  failed = true
  console.error(err.message)
} finally {
  await browser?.close()
}
process.exit(failed ? 1 : 0)
