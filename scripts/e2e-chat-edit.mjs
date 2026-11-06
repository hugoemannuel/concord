// E2E do chat no app web: editar mensagem (canal e DM, o outro lado vê
// "(editada)"), selecionar/copiar texto e clicar em link. Não precisa de LiveKit.
// Uso: backend rodando (sem SMTP, com a saída num arquivo: o e-mail de
// confirmação sai no log) e o dist-web servido com o proxy do backend:
//   (backend)  go run ./cmd > /tmp/backend.log 2>&1
//   (frontend) yarn build:web && WEB_BACKEND_URL=http://localhost:8080 yarn preview:web
//   APP=http://localhost:4173/ BACKEND_LOG=/tmp/backend.log SHOTS=./shots CHROME=<chromium> \
//     node scripts/e2e-chat-edit.mjs
import { createRequire } from 'module'
import { mkdirSync } from 'fs'
import { createE2E } from './lib/e2e.mjs'
const require = createRequire(new URL('../frontend/package.json', import.meta.url))
const { chromium } = require('playwright')

const APP = process.env.APP ?? 'http://localhost:4173/'
const SHOTS = process.env.SHOTS ?? './shots'
mkdirSync(SHOTS, { recursive: true })
const API = new URL('api', APP).toString()
const run = Date.now().toString(36)
const { api, makeUser } = createE2E({ api: API, run })

function check(desc, ok, detail) {
  if (!ok) throw new Error(`FAIL ${desc}: ${JSON.stringify(detail)}`)
  console.log(`PASS ${desc}`)
}

async function waitFor(desc, fn, ok, timeout = 15000) {
  const start = Date.now()
  let last
  while (Date.now() - start < timeout) {
    last = await fn()
    if (ok(last)) {
      console.log(`PASS ${desc}:`, JSON.stringify(last))
      return last
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`FAIL ${desc}: ${JSON.stringify(last)}`)
}

const ana = await makeUser('ana')
const bia = await makeUser('bia')
await api('/friends/request', { token: ana.token, method: 'POST', body: { username: bia.username } })
await api(`/friends/${ana.username}/accept`, { token: bia.token, method: 'PUT' })
const server = await api('/servers', { token: ana.token, method: 'POST', body: { name: `Edit ${run}` } })
const serverId = server.id ?? server.server?.id
const channel = await api(`/servers/${serverId}/channels`, {
  token: ana.token,
  method: 'POST',
  body: { name: 'texto', type: 'text' }
})
const channelId = channel.id ?? channel.channel?.id
await api(`/servers/${serverId}/invite`, { token: ana.token, method: 'POST', body: { user_id: bia.id } })
const invites = await api('/invites', { token: bia.token })
const invite = (Array.isArray(invites) ? invites : invites.invites).find(
  (i) => (i.server_id ?? i.server?.id) === serverId
)
await api(`/invites/${invite.id}/accept`, { token: bia.token, method: 'POST' })
console.log('setup ok', { serverId, channelId })

const browser = await chromium.launch({ executablePath: process.env.CHROME })
const errors = []
async function openClient(user) {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } })
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(APP).origin })
  // Destino dos links: sem internet no teste, responde aqui mesmo.
  await context.route('https://example.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<title>destino</title>ok' })
  )
  const page = await context.newPage()
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`[${user.username}] ${m.text()}`)
  })
  page.on('pageerror', (e) => errors.push(`[${user.username}] pageerror ${e.message}`))
  await page.goto(APP + 'login')
  await page.fill('input[autocomplete=username]', user.email)
  await page.fill('input[type=password]', user.password)
  await page.click('button[type=submit]')
  await page.getByText('Adicionar amigo').first().waitFor({ timeout: 30000 })
  return { context, page }
}

const composerOf = (page) => page.locator('form input[maxlength="2000"]')
const row = (page, text) => page.locator('[id^="msg-"]', { hasText: text }).last()

let failed = false
try {
  const A = await openClient(ana)
  const B = await openClient(bia)
  const pageA = A.page
  const pageB = B.page

  const channelUrl = APP + `servers/${serverId}/channels/${channelId}`
  await pageA.goto(channelUrl)
  await pageB.goto(channelUrl)
  const composerA = composerOf(pageA)
  await composerA.waitFor({ timeout: 15000 })
  await composerOf(pageB).waitFor({ timeout: 15000 })

  // 1) Envio com link + menção.
  const original = `oi @${bia.username}, olha https://example.com/wiki/Rio_(cidade). e www.example.com/x? ${run}`
  await composerA.fill(original)
  await composerA.press('Enter')
  await row(pageB, run).waitFor({ timeout: 15000 })

  const linksB = await row(pageB, run).locator('a').evaluateAll((as) =>
    as.map((a) => ({ text: a.textContent, href: a.getAttribute('href'), target: a.target, rel: a.rel }))
  )
  check(
    'links viram <a> com href certo, target=_blank e rel=noopener noreferrer',
    linksB.length === 2 &&
      linksB[0].href === 'https://example.com/wiki/Rio_(cidade)' &&
      linksB[0].text === 'https://example.com/wiki/Rio_(cidade)' &&
      linksB[1].href === 'https://www.example.com/x' &&
      linksB.every((l) => l.target === '_blank' && l.rel === 'noopener noreferrer'),
    linksB
  )
  const chip = await row(pageB, run).locator('span', { hasText: `@${bia.username}` }).count()
  check('menção continua em chip junto com os links', chip > 0, chip)

  // 2) Editar com ↑ no campo vazio (ana), Enter salva.
  await composerA.click()
  await composerA.press('ArrowUp')
  const editor = pageA.getByRole('textbox', { name: 'Editar mensagem' })
  await editor.waitFor({ timeout: 5000 })
  check('↑ no campo vazio abre a edição com o texto atual', (await editor.inputValue()) === original)
  await pageA.screenshot({ path: `${SHOTS}/01-ana-editando.png` })
  const edited = `editei: https://example.com/novo ${run}`
  await editor.fill(edited)
  await editor.press('Enter')
  await editor.waitFor({ state: 'detached', timeout: 5000 })

  await waitFor(
    'bia vê o texto novo e "(editada)" sem recarregar',
    () => row(pageB, run).innerText(),
    (t) => t.includes('editei:') && t.includes('(editada)') && !t.includes('olha')
  )
  await pageB.mouse.move(5, 5)
  const rowClass = await row(pageB, run).getAttribute('class')
  check('tirar a menção na edição tira o destaque de "mencionou você"', !rowClass.includes('f0b232'), rowClass)
  const tooltip = await row(pageB, run).getByText('(editada)').getAttribute('title')
  check('"(editada)" tem a hora da edição no tooltip', /^Editada em \d{2}\/\d{2}\/\d{4}/.test(tooltip ?? ''), tooltip)
  await pageB.screenshot({ path: `${SHOTS}/02-bia-ve-editada.png` })

  // Ordem: mensagem editada não sai do lugar.
  await composerA.fill(`segunda ${run}`)
  await composerA.press('Enter')
  await row(pageB, `segunda ${run}`).waitFor({ timeout: 10000 })
  await composerA.click()
  await composerA.press('ArrowUp')
  await editor.waitFor({ timeout: 5000 })
  check('↑ pega a última mensagem sua', (await editor.inputValue()) === `segunda ${run}`)
  // Esc cancela sem mudar nada.
  await editor.press('Escape')
  await editor.waitFor({ state: 'detached', timeout: 5000 })
  check('Esc cancela (sem "(editada)")', !(await row(pageA, `segunda ${run}`).innerText()).includes('(editada)'))

  // Edita a primeira pelo hover, com Shift+Enter (quebra de linha).
  await row(pageA, 'editei:').hover()
  await pageA.getByRole('button', { name: 'Editar', exact: true }).click()
  await editor.waitFor({ timeout: 5000 })
  await editor.press('End')
  await editor.press('Shift+Enter')
  await editor.type('linha 2')
  await editor.press('Enter')
  await waitFor(
    'bia vê a quebra de linha da edição pelo hover',
    () => row(pageB, 'editei:').innerText(),
    (t) => t.includes('linha 2')
  )
  const order = await pageB.locator('[id^="msg-"]').evaluateAll((els) => els.map((e) => e.innerText))
  const iFirst = order.findIndex((t) => t.includes('editei:'))
  const iSecond = order.findIndex((t) => t.includes(`segunda ${run}`))
  check('a editada continua antes da segunda (ordem por created_at)', iFirst >= 0 && iFirst < iSecond, { iFirst, iSecond })

  // Bia não tem "Editar" na mensagem da ana.
  await row(pageB, 'editei:').hover()
  check('sem "Editar" na mensagem dos outros', (await pageB.getByRole('button', { name: 'Editar', exact: true }).count()) === 0)

  // 3) Selecionar e copiar (bia).
  const styles = await row(pageB, 'editei:').evaluate((el) => ({
    text: getComputedStyle(el.querySelector('p')).userSelect,
    name: getComputedStyle(el.querySelector('button.font-semibold')).userSelect
  }))
  check('texto selecionável, nome do autor não', styles.text === 'text' && styles.name === 'none', styles)

  const p = row(pageB, 'editei:').locator('p')
  const box = await p.boundingBox()
  await pageB.mouse.move(box.x + 2, box.y + 6)
  await pageB.mouse.down()
  await pageB.mouse.move(box.x + box.width - 2, box.y + box.height - 4, { steps: 10 })
  await pageB.mouse.up()
  const selected = await pageB.evaluate(() => window.getSelection().toString())
  check('arrastar o mouse seleciona o texto da mensagem', selected.includes('editei:') && !selected.includes('bia'), selected)
  await pageB.screenshot({ path: `${SHOTS}/03-bia-selecionou.png` })

  await pageB.keyboard.press('Control+C')
  const viaCtrlC = await pageB.evaluate(() => navigator.clipboard.readText())
  check('Ctrl+C copia a seleção', viaCtrlC.includes('editei:'), viaCtrlC)

  await pageB.evaluate(() => navigator.clipboard.writeText(''))
  await row(pageB, `segunda ${run}`).hover()
  await pageB.getByRole('button', { name: 'Copiar texto' }).click()
  await pageB.getByText('Copiado', { exact: true }).waitFor({ timeout: 5000 })
  const copied = await pageB.evaluate(() => navigator.clipboard.readText())
  check('"Copiar texto" copia e mostra o aviso "Copiado"', copied === `segunda ${run}`, copied)
  await pageB.screenshot({ path: `${SHOTS}/04-bia-copiado.png` })

  // 4) Clicar no link abre em outra aba (o app não sai do lugar).
  const before = pageB.url()
  const [popup] = await Promise.all([
    B.context.waitForEvent('page'),
    row(pageB, 'editei:').locator('a', { hasText: 'https://example.com/novo' }).click()
  ])
  await popup.waitForLoadState()
  check('link abre numa aba nova com o destino certo', popup.url() === 'https://example.com/novo', popup.url())
  check('aba nova sem window.opener (noopener)', (await popup.evaluate(() => window.opener)) === null)
  check('o app continua onde estava', pageB.url() === before, pageB.url())
  await popup.close()

  // 5) DM: editar e o outro lado ver "(editada)".
  await pageA.goto(APP + `dm/${bia.id}`)
  await pageB.goto(APP + `dm/${ana.id}`)
  const dmA = pageA.getByPlaceholder(/Mensagem para @/)
  await dmA.waitFor({ timeout: 15000 })
  await dmA.fill(`na dm ${run}`)
  await dmA.press('Enter')
  await row(pageB, `na dm ${run}`).waitFor({ timeout: 15000 })
  await dmA.click()
  await dmA.press('ArrowUp')
  await editor.waitFor({ timeout: 5000 })
  await editor.fill(`na dm, editada ${run}`)
  await editor.press('Enter')
  await waitFor(
    'na DM a bia vê a edição e "(editada)"',
    () => row(pageB, `${run}`).innerText(),
    (t) => t.includes('na dm, editada') && t.includes('(editada)')
  )
  await pageB.screenshot({ path: `${SHOTS}/05-bia-dm-editada.png` })

  // Reload: edited_at vem da API também.
  await pageB.reload()
  await waitFor(
    'depois do reload continua "(editada)"',
    () => row(pageB, `${run}`).innerText().catch(() => ''),
    (t) => t.includes('(editada)')
  )

  const relevant = errors.filter((e) => !/favicon|livekit|rtc|Failed to load resource.*404/i.test(e))
  check('sem erros no console', relevant.length === 0, relevant)
} catch (err) {
  failed = true
  console.error(err.message)
  console.error('console errors:', errors)
} finally {
  await browser.close()
}
process.exit(failed ? 1 : 0)
