// E2E Electron + backend/LiveKit locais. Isola perfis em /tmp/opencode.
// O download é um artefato de teste com assinatura Ed25519 real. Somente o
// instalador nativo é substituído por fechar o Electron; a reabertura é real.
// Uso: BACKEND_LOG=<saída do backend> xvfb-run -a node scripts/e2e-update-call.mjs
// Requer backend e LiveKit em localhost:8080. Não instala nem publica releases.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { generateKeyPairSync, sign } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createE2E } from './lib/e2e.mjs'

const frontend = resolve(import.meta.dirname, '../frontend')
const require = createRequire(join(frontend, 'package.json'))
const { _electron: electron } = require('playwright')
const root = mkdtempSync('/tmp/opencode/update-call-e2e-')
const API = 'http://localhost:8080/api'
const run = Date.now().toString(36)
const password = 'e2e-update-call-local-123'
const { publicKey, privateKey } = generateKeyPairSync('ed25519')
const installer = join(root, 'setup.exe')
const payload = Buffer.from('local updater e2e fixture')
writeFileSync(installer, payload)
const signature = sign(null, payload, privateKey).toString('base64')
const bootstrap = join(root, 'bootstrap.cjs')
writeFileSync(bootstrap, `
const { createRequire } = require('node:module')
const requireApp = createRequire(${JSON.stringify(join(frontend, 'package.json'))})
const { app, net } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
app.setPath('appData', process.env.E2E_PROFILE)
Object.defineProperty(app, 'isPackaged', { get: () => true })
app.getVersion = () => '0.6.0'
const { autoUpdater } = requireApp('electron-updater')
autoUpdater.checkForUpdates = async () => null
autoUpdater.downloadUpdate = async () => {
  setTimeout(() => autoUpdater.emit('update-downloaded', {
    version: '0.6.1', downloadedFile: ${JSON.stringify(installer)}
  }), Number(process.env.E2E_DOWNLOAD_DELAY || 100))
  return []
}
const originalFetch = net.fetch.bind(net)
net.fetch = (url, ...args) => String(url).endsWith('/setup.exe.sig')
  ? Promise.resolve(new Response(${JSON.stringify(signature)})) : originalFetch(url, ...args)
autoUpdater.quitAndInstall = (silent, reopen) => {
  const file = path.join(app.getPath('userData'), 'update-call-resume.json')
  fs.writeFileSync(process.env.E2E_MARKER, JSON.stringify({
    silent, reopen, snapshot: fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null
  }))
  setTimeout(() => app.quit(), 50)
}
global.e2eOffer = () => autoUpdater.emit('update-available', { version: '0.6.1' })
requireApp(${JSON.stringify(join(frontend, 'out/main/index.js'))})
`)

const e2e = createE2E({ api: API, run, password })
const { makeUser } = e2e
async function api(path, { allowNotFound = false, ...opts } = {}) {
  const res = await e2e.request(path, opts)
  if (allowNotFound && res.status === 404) return null
  assert(res.ok, `${opts.method ?? 'GET'} ${path}: ${res.status} ${res.text}`)
  return res.body
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function waitFor(label, fn, timeout = 25000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (await fn()) { console.log(`PASS ${label}`); return }
    await sleep(250)
  }
  throw new Error(`FAIL ${label}`)
}

const profiles = new Map()
const openApps = new Set()
async function launch(name, downloadDelay = 100) {
  if (!profiles.has(name)) profiles.set(name, mkdtempSync(join(root, `${name}-`)))
  const env = { ...process.env, E2E_PROFILE: profiles.get(name), E2E_MARKER: join(root, `${name}-install.json`), E2E_DOWNLOAD_DELAY: String(downloadDelay) }
  delete env.ELECTRON_RUN_AS_NODE
  const app = await electron.launch({
    executablePath: require('electron'),
    args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
      '--autoplay-policy=no-user-gesture-required', bootstrap],
    env, timeout: 30000
  })
  openApps.add(app)
  app.on('close', () => openApps.delete(app))
  const page = await app.firstWindow()
  page.on('pageerror', (error) => console.error(`[${name}]`, error.message))
  return { app, page }
}

async function login(page, user) {
  await page.locator('input[autocomplete=username]').fill(user.email)
  await page.locator('input[type=password]').fill(password)
  await page.locator('button[type=submit]').click()
  await page.getByText('Adicionar amigo').first().waitFor()
}

let owner, server
try {
  execFileSync(join(frontend, 'node_modules/.bin/electron-vite'), ['build'], {
    cwd: frontend,
    env: { ...process.env, VITE_SERVER_URL: 'http://localhost:8080',
      CONCORD_UPDATE_PUBKEY: publicKey.export({ type: 'spki', format: 'pem' }) },
    stdio: 'pipe'
  })
  owner = await makeUser('updmain')
  const peer = await makeUser('updpeer')
  server = await api('/servers', { token: owner.token, method: 'POST', body: { name: `Update E2E ${run}` } })
  const channel = await api(`/servers/${server.id}/channels`, {
    token: owner.token, method: 'POST', body: { name: 'update-e2e', type: 'voice' }
  })
  const { code } = await api(`/servers/${server.id}/invite-code`, { token: owner.token })
  await api('/invites/join', { token: peer.token, method: 'POST', body: { code } })
  const route = `#/servers/${server.id}/channels/${channel.id}`
  const active = async () => (await api(`/calls/active?scope=channel&id=${channel.id}`, {
    token: owner.token, allowNotFound: true
  })) ?? { call: null, participants: [] }
  const joinChannel = async (page) => {
    await page.evaluate((hash) => { location.hash = hash }, `#/servers/${server.id}`)
    await page.getByText('update-e2e', { exact: true }).first().click()
    await page.getByText('Voz conectada', { exact: true }).waitFor()
  }
  const secondary = await launch('peer')
  await login(secondary.page, peer)
  await joinChannel(secondary.page)
  let primary = await launch('main')
  await login(primary.page, owner)
  await joinChannel(primary.page)
  await waitFor('dois participantes reais no backend', async () => (await active()).participants.length === 2)
  await waitFor('áudio remoto real antes da atualização', () => secondary.page.evaluate(() =>
    [...document.querySelectorAll('audio')].some((el) => el.srcObject?.getAudioTracks().some((t) => t.readyState === 'live'))))
  await primary.page.getByRole('button', { name: 'Silenciar Audio', exact: true }).first().click()
  await primary.page.getByRole('button', { name: 'Ativar Audio', exact: true }).first().waitFor()
  await primary.app.evaluate(() => global.e2eOffer())
  await primary.page.getByRole('button', { name: 'Atualizar', exact: true }).click()
  const closed = primary.app.waitForEvent('close')
  await primary.page.getByRole('button', { name: 'Atualizar mesmo assim', exact: true }).click()
  await closed
  const marker = JSON.parse(readFileSync(join(root, 'main-install.json'), 'utf8'))
  assert(marker.silent && marker.reopen, 'instalador precisa solicitar reabertura')
  assert(marker.snapshot, 'FAIL atualização não salvou a chamada ativa')
  assert.equal(marker.snapshot.channelId, channel.id)
  assert(marker.snapshot.muted && marker.snapshot.deafened)
  console.log('PASS snapshot persistido antes do fechamento')
  primary = await launch('main')
  await primary.page.waitForURL((url) => url.hash === route)
  await primary.page.getByText('Voz conectada', { exact: true }).waitFor()
  await primary.page.getByRole('button', { name: 'Ativar Audio', exact: true }).first().waitFor()
  await primary.page.getByRole('button', { name: 'Ativar Microfone', exact: true }).first().waitFor()
  await waitFor('reentrada única com mudo/ensurdecido no backend', async () => {
    const state = await active()
    const mine = state.participants.filter((p) => p.user_id === owner.id)
    return state.participants.length === 2 && mine.length === 1 && mine[0].muted && mine[0].deafened
  })
  assert(!existsSync(join(profiles.get('main'), 'Concord/update-call-resume.json')))
  console.log('PASS retomada consumida do disco')
  assert.equal(await primary.page.getByRole('button', { name: 'Desligar câmera', exact: true }).count(), 0)
  assert.equal(await primary.page.getByRole('button', { name: 'Parar de compartilhar tela', exact: true }).count(), 0)
  console.log('PASS câmera e tela continuam desligadas')
  await primary.page.getByRole('button', { name: 'Ativar Audio', exact: true }).first().click()
  await primary.page.getByRole('button', { name: 'Silenciar Microfone', exact: true }).first().waitFor()
  await waitFor('estado de áudio anterior restaurado ao desensurdecer', async () => {
    const mine = (await active()).participants.find((p) => p.user_id === owner.id)
    return mine && !mine.muted && !mine.deafened
  })
  await waitFor('áudio remoto real depois da retomada', () => secondary.page.evaluate(() =>
    [...document.querySelectorAll('audio')].some((el) => el.srcObject?.getAudioTracks().some((t) => t.readyState === 'live'))))
  await primary.page.screenshot({ path: join(root, 'resumed-call.png') })
  await primary.app.close()
  primary = await launch('main')
  await primary.page.getByText('Adicionar amigo').first().waitFor()
  await sleep(3000)
  assert.equal(await primary.page.getByText('Voz conectada', { exact: true }).count(), 0)
  console.log('PASS fechamento normal não reconecta')
  await primary.page.screenshot({ path: join(root, 'normal-reopen.png') })

  // Reinício demorado e canal vazio: a chamada antiga acaba no backend.
  await secondary.app.close()
  await joinChannel(primary.page)
  await waitFor('somente o cliente principal permanece no canal', async () => {
    const state = await active()
    return state.participants.length === 1 && state.participants[0].user_id === owner.id
  })
  const oldCallId = (await active()).call.id
  await primary.page.getByRole('button', { name: 'Silenciar Microfone', exact: true }).first().click()
  await primary.app.evaluate(() => global.e2eOffer())
  await primary.page.getByRole('button', { name: 'Atualizar', exact: true }).click()
  const slowClose = primary.app.waitForEvent('close')
  await primary.page.getByRole('button', { name: 'Atualizar mesmo assim', exact: true }).click()
  await slowClose
  await waitFor('chamada antiga encerrada após tolerância de desconexão', async () => !(await active()).call)
  primary = await launch('main')
  await primary.page.waitForURL((url) => url.hash === route)
  await primary.page.getByText('Voz conectada', { exact: true }).waitFor()
  await primary.page.getByRole('button', { name: 'Ativar Microfone', exact: true }).first().waitFor()
  await waitFor('recria a chamada no mesmo canal, preservando apenas mudo', async () => {
    const state = await active()
    const mine = state.participants.find((p) => p.user_id === owner.id)
    return state.call?.id !== oldCallId && mine?.muted && !mine.deafened
  })
  await primary.app.close()

  // A pessoa sai manualmente enquanto a atualização ainda está baixando.
  primary = await launch('main', 3000)
  await primary.page.getByText('Adicionar amigo').first().waitFor()
  await joinChannel(primary.page)
  await primary.app.evaluate(() => global.e2eOffer())
  await primary.page.getByRole('button', { name: 'Atualizar', exact: true }).click()
  const manualClose = primary.app.waitForEvent('close')
  await primary.page.getByRole('button', { name: 'Atualizar mesmo assim', exact: true }).click()
  await primary.page.getByRole('button', { name: 'Desconectar', exact: true }).first().click()
  await manualClose
  const manualMarker = JSON.parse(readFileSync(join(root, 'main-install.json'), 'utf8'))
  assert.equal(manualMarker.snapshot, null)
  primary = await launch('main')
  await primary.page.getByText('Adicionar amigo').first().waitFor()
  await sleep(3000)
  assert.equal(await primary.page.getByText('Voz conectada', { exact: true }).count(), 0)
  console.log('PASS saída manual durante download não gera retomada')
  await primary.app.close()

  // Registro fora da validade não deve abrir o microfone nem entrar no canal.
  const pendingPath = join(profiles.get('main'), 'Concord/update-call-resume.json')
  writeFileSync(pendingPath, JSON.stringify({ ...marker.snapshot, savedAt: Date.now() - 11 * 60_000 }))
  primary = await launch('main')
  await primary.page.getByText('Adicionar amigo').first().waitFor()
  await sleep(3000)
  assert.equal(await primary.page.getByText('Voz conectada', { exact: true }).count(), 0)
  assert(!existsSync(pendingPath))
  console.log('PASS registro expirado descartado sem conectar')
  console.log(`PASS E2E completo. Evidências: ${root}`)
} finally {
  for (const app of openApps) await app.close().catch(() => {})
  if (server && owner) await api(`/servers/${server.id}`, { token: owner.token, method: 'DELETE' }).catch(console.error)
  // Volta ao build normal: nenhuma chave de teste fica nos artefatos locais.
  execFileSync(join(frontend, 'node_modules/.bin/electron-vite'), ['build'], { cwd: frontend, stdio: 'pipe' })
}
