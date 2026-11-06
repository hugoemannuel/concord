// E2E do app web (yarn build:web): login, rotas de verdade com reload,
// DM com imagem, aviso do navegador + "(n) Salinha" no título, chamada com
// compartilhamento de tela pelo seletor do navegador, refresh do token e logout.
// Tudo na mesma origem, como em produção atrás do Caddy.
// Uso: backend + LiveKit rodando e o dist-web servido com o proxy do backend:
//   (frontend) yarn build:web && WEB_BACKEND_URL=http://localhost:8080 yarn preview:web
//   APP=http://localhost:4173/ BACKEND_LOG=<saída do backend> node scripts/e2e-web.mjs
import { createRequire } from 'module'
import { createE2E } from './lib/e2e.mjs'
const require = createRequire(new URL('../frontend/package.json', import.meta.url))
const { chromium } = require('playwright')

const APP = process.env.APP ?? 'http://localhost:4173/'
const API = new URL('api', APP).toString()
const run = Date.now().toString(36)
const { api, makeUser } = createE2E({ api: API, run })
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
)

const ana = await makeUser('ana')
const bia = await makeUser('bia')
await api('/friends/request', { token: ana.token, method: 'POST', body: { username: bia.username } })
await api(`/friends/${ana.username}/accept`, { token: bia.token, method: 'PUT' })
const server = await api('/servers', { token: ana.token, method: 'POST', body: { name: `Web ${run}` } })
const serverId = server.id ?? server.server?.id
const channel = await api(`/servers/${serverId}/channels`, {
  token: ana.token, method: 'POST', body: { name: 'voz-web', type: 'voice' }
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
    '--auto-select-desktop-capture-source=Entire screen',
    '--autoplay-policy=no-user-gesture-required'
  ]
})

// Foco e Notification controláveis: no headless a aba está sempre "olhando".
function fakeBrowserNotifications() {
  window.__focused = true
  document.hasFocus = () => window.__focused
  window.__notes = []
  window.__permission = 'default'
  class FakeNotification {
    static get permission() { return window.__permission }
    static async requestPermission() { window.__permission = 'granted'; return 'granted' }
    constructor(title, options) { window.__notes.push({ title, ...options }); this.onclick = null }
    close() {}
  }
  window.Notification = FakeNotification
}

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
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error(`FAIL ${desc}: ${JSON.stringify(last)}`)
}

const errors = []
async function openClient(user, initScript) {
  const context = await browser.newContext({ permissions: ['microphone', 'camera'], viewport: { width: 1600, height: 1000 } })
  const page = await context.newPage()
  if (initScript) await page.addInitScript(initScript)
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${user.username}] ${m.text()}`) })
  page.on('pageerror', (e) => errors.push(`[${user.username}] pageerror ${e.message}`))
  await page.goto(APP + 'login')
  await page.fill('input[autocomplete=username]', user.email)
  await page.fill('input[type=password]', user.password)
  await page.click('button[type=submit]')
  await page.getByText('Adicionar amigo').first().waitFor({ timeout: 30000 })
  return page
}

const audioTracks = (page) => page.evaluate(() =>
  [...document.querySelectorAll('audio')].flatMap((el) =>
    el.srcObject ? el.srcObject.getAudioTracks().map((t) => t.readyState) : []))
const videoTracks = (page) => page.evaluate(() =>
  [...document.querySelectorAll('video')].flatMap((el) =>
    el.srcObject ? el.srcObject.getVideoTracks().map((t) => `${t.readyState}:${el.videoWidth}x${el.videoHeight}`) : []))

let failed = false
let pages = []
try {
  const pageA = await openClient(ana)
  check('login leva à home com rota de verdade (sem #)', !pageA.url().includes('#') && new URL(pageA.url()).pathname === '/', pageA.url())
  const pageB = await openClient(bia, fakeBrowserNotifications)
  pages = [pageA, pageB]

  // Permissão de notificação: pedida por botão nas configurações, não ao abrir.
  check('nada pede permissão ao abrir a página', (await pageB.evaluate(() => window.__permission)) === 'default')
  await pageB.getByRole('button', { name: 'Configurações do usuário' }).click()
  await pageB.getByRole('button', { name: 'Notificações', exact: true }).click()
  await pageB.getByRole('button', { name: 'Permitir notificações' }).click()
  await pageB.getByText('Permitidas neste navegador.').waitFor({ timeout: 5000 })
  check('botão "Permitir notificações" pede e mostra permitido', (await pageB.evaluate(() => window.__permission)) === 'granted')
  check('sem opções só do desktop (iniciar com o Windows, overlay)',
    (await pageB.getByText('Iniciar com o Windows').count()) === 0 && (await pageB.getByText('Overlay nos jogos').count()) === 0)
  await pageB.keyboard.press('Escape')

  // DM com texto + imagem, de ana para bia (bia fora da aba).
  await pageB.evaluate(() => { window.__focused = false })
  await pageA.goto(APP + `dm/${bia.id}`)
  const composer = pageA.getByPlaceholder(/Mensagem para @/)
  await composer.waitFor({ timeout: 15000 })
  await composer.fill(`oi bia ${run}`)
  await composer.press('Enter')
  await waitFor('bia recebe aviso do navegador', () => pageB.evaluate(() => window.__notes.map((n) => n.title)), (t) => t.includes('ana'))
  await waitFor('título da aba mostra a não lida', () => pageB.title(), (t) => t === '(1) Salinha')
  await pageB.evaluate(() => { window.__focused = true; window.dispatchEvent(new Event('focus')) })
  await waitFor('voltar à aba limpa o título', () => pageB.title(), (t) => t === 'Salinha')

  await pageA.setInputFiles('input[type=file]', { name: 'foto.png', mimeType: 'image/png', buffer: PNG })
  await pageA.waitForTimeout(1500)
  await composer.press('Enter')
  await pageB.goto(APP + `dm/${ana.id}`)
  await pageB.getByText(`oi bia ${run}`).first().waitFor({ timeout: 15000 })
  await waitFor('bia vê a imagem da DM (/api/media na mesma origem)', () => pageB.evaluate(() =>
    [...document.querySelectorAll('img[src*="/api/media/"]')].map((img) => img.complete && img.naturalWidth > 0)), (l) => l.includes(true))

  // Reload em rota funda (o servidor devolve o index.html).
  await pageB.reload()
  await pageB.getByText(`oi bia ${run}`).first().waitFor({ timeout: 15000 })
  check('reload em /dm/:id continua na conversa', new URL(pageB.url()).pathname === `/dm/${ana.id}`, pageB.url())
  await pageB.goto(APP + `servers/${serverId}/channels/${channelId}`)
  await pageB.reload()
  await pageB.getByText('voz-web', { exact: true }).first().waitFor({ timeout: 15000 })
  check('reload em /servers/:id/channels/:id continua no servidor', new URL(pageB.url()).pathname === `/servers/${serverId}/channels/${channelId}`, pageB.url())

  // Chamada (LiveKit por wss/ws da mesma origem) + tela pelo seletor do navegador.
  await pageA.goto(APP + `servers/${serverId}`)
  await pageA.getByText('voz-web', { exact: true }).first().click()
  await pageB.getByText('voz-web', { exact: true }).first().click()
  await waitFor('ana ouve a bia', () => audioTracks(pageA), (t) => t.includes('live'), 30000)
  await waitFor('bia ouve a ana', () => audioTracks(pageB), (t) => t.includes('live'), 30000)
  await pageA.getByRole('button', { name: 'Compartilhar tela' }).first().click()
  await waitFor('ana compartilha a tela', () => pageA.getByRole('button', { name: 'Parar de compartilhar tela' }).count(), (n) => n > 0)
  check('sem o seletor do Electron no web', (await pageA.getByText('Compartilhe sua tela').count()) === 0)
  await pageB.getByRole('button', { name: 'Assistir transmissão' }).click()
  await waitFor('bia vê a tela da ana', () => videoTracks(pageB), (t) => t.some((v) => v.startsWith('live:') && !v.endsWith(':0x0')), 30000)
  const beforeUnload = await pageA.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    return event.defaultPrevented
  })
  check('fechar a aba em chamada pede confirmação', beforeUnload === true)
  await pageA.getByRole('button', { name: 'Parar de compartilhar tela' }).first().click()

  // Access token vencido: o refresh renova sem deslogar.
  await pageB.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('concord-auth'))
    saved.state.accessToken = 'vencido'
    saved.state.user = null
    localStorage.setItem('concord-auth', JSON.stringify(saved))
  })
  await pageB.goto(APP + 'friends')
  await pageB.getByText('Adicionar amigo').first().waitFor({ timeout: 15000 })
  const renewed = await pageB.evaluate(() => JSON.parse(localStorage.getItem('concord-auth')).state.accessToken)
  check('token inválido é renovado pelo refresh', renewed && renewed !== 'vencido')

  // Duas abas com o mesmo login vencido renovam juntas: o refresh token é de
  // uso único, então uma renova e a outra usa os tokens novos (ninguém desloga).
  const pageB2 = await pageB.context().newPage()
  pageB2.on('pageerror', (e) => errors.push(`[bia-2] pageerror ${e.message}`))
  await pageB2.goto(APP + 'friends')
  await pageB2.getByText('Adicionar amigo').first().waitFor({ timeout: 15000 })
  for (let round = 1; round <= 3; round++) {
    // A outra aba sai da página antes: o evento storage a faria renovar já, e o
    // reload logo abaixo cortaria esse refresh no meio (token gasto, resposta perdida).
    await pageB2.goto('about:blank')
    await pageB.evaluate((n) => {
      const saved = JSON.parse(localStorage.getItem('concord-auth'))
      saved.state.accessToken = `vencido-${n}`
      saved.state.user = null
      localStorage.setItem('concord-auth', JSON.stringify(saved))
    }, round)
    await Promise.all([pageB.goto(APP + 'friends'), pageB2.goto(APP + 'friends')])
    await Promise.all([
      pageB.getByText('Adicionar amigo').first().waitFor({ timeout: 15000 }),
      pageB2.getByText('Adicionar amigo').first().waitFor({ timeout: 15000 })
    ])
    const access = await pageB.evaluate(() => JSON.parse(localStorage.getItem('concord-auth')).state.accessToken)
    const me = await fetch(API + '/users/me', { headers: { Authorization: `Bearer ${access}` } })
    check(`duas abas renovam juntas sem deslogar (rodada ${round})`,
      me.status === 200 && new URL(pageB.url()).pathname === '/friends' && new URL(pageB2.url()).pathname === '/friends',
      { status: me.status, a: pageB.url(), b: pageB2.url() })
  }

  // Queda de rede na renovação não desloga: mantém os tokens e tenta de novo.
  await pageB2.goto('about:blank')
  await pageB.route('**/api/auth/refresh', (route) => route.abort('internetdisconnected'))
  await pageB.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('concord-auth'))
    saved.state.accessToken = 'vencido-rede'
    saved.state.user = null
    localStorage.setItem('concord-auth', JSON.stringify(saved))
  })
  await pageB.goto(APP + 'friends')
  await pageB.getByText('Sem conexão com o servidor').waitFor({ timeout: 15000 })
  const kept = await pageB.evaluate(() => JSON.parse(localStorage.getItem('concord-auth')).state)
  check('rede fora na renovação mantém a sessão salva', kept.refreshToken && new URL(pageB.url()).pathname === '/friends', kept)
  await pageB.unroute('**/api/auth/refresh')
  await pageB.getByText('Adicionar amigo').first().waitFor({ timeout: 15000 })
  check('a rede volta e o app renova sozinho', true)
  await pageB2.goto(APP + 'friends')
  await pageB2.getByText('Adicionar amigo').first().waitFor({ timeout: 15000 })

  // Logout limpa a sessão, vale para a outra aba e sobrevive ao reload.
  await pageB.getByRole('button', { name: 'Configurações do usuário' }).click()
  await pageB.getByRole('button', { name: 'Sair', exact: true }).click()
  await pageB2.waitForURL((u) => u.pathname === '/login', { timeout: 15000 })
  check('sair numa aba leva a outra ao login', new URL(pageB2.url()).pathname === '/login')
  await pageB.waitForURL((u) => u.pathname === '/login', { timeout: 15000 })
  await pageB.reload()
  check('depois do logout o reload fica no login', new URL(pageB.url()).pathname === '/login', pageB.url())
  const tokens = await pageB.evaluate(() => JSON.parse(localStorage.getItem('concord-auth') ?? '{}').state ?? {})
  check('logout apaga os tokens', !tokens.accessToken && !tokens.refreshToken, tokens)

  const relevant = errors.filter((e) => !e.includes('401') && !e.includes('Failed to load resource'))
  check('sem erros no console (fora 401 esperados)', relevant.length === 0, relevant)
} catch (err) {
  failed = true
  console.log(err.message.split('\n').slice(0, 6).join(' / '))
  if (errors.length) console.log('console:', errors.slice(0, 10))
  const dir = process.env.SHOTS ?? (await import('os')).tmpdir()
  for (const [i, page] of pages.entries()) await page.screenshot({ path: `${dir}/salinha-e2e-web-${i}.png` }).catch(() => {})
} finally {
  await browser.close()
}
process.exit(failed ? 1 : 0)
