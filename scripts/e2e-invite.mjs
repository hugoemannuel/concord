// E2E do convite por código: Ana pega o link em "Convidar"; Bia (que não é
// amiga dela) cola o link e entra no servidor sozinha.
// Uso: igual ao scripts/e2e-voice.mjs (backend rodando + renderer servido em APP).
//   API=http://localhost:8080/api APP=http://localhost:5174/ BACKEND_LOG=<saída do backend> node scripts/e2e-invite.mjs
import { createRequire } from 'module'
import { createE2E } from './lib/e2e.mjs'
const require = createRequire(new URL('../frontend/package.json', import.meta.url))
const { chromium } = require('playwright')

const API = process.env.API ?? 'http://localhost:8080/api'
const APP = process.env.APP ?? 'http://localhost:5174/'
const run = Date.now().toString(36)
const { request: api, makeUser } = createE2E({ api: API, run })

function check(desc, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${desc}${detail === undefined ? '' : ': ' + JSON.stringify(detail)}`)
  if (!ok) process.exitCode = 1
}

const ana = await makeUser('ana')
const bia = await makeUser('bia')
const server = (await api('/servers', { token: ana.token, method: 'POST', body: { name: `Turma ${run}` } })).body
const serverId = server.id ?? server.server?.id

const browser = await chromium.launch({ executablePath: process.env.CHROME })
// Simula o processo main do Electron: registra notificações e sons tocados.
function fakeDesktop() {
  window.__notifications = []
  window.__sounds = 0
  const noop = () => () => {}
  window.api = {
    background: {
      notify: (n) => window.__notifications.push(n),
      setCallState: () => {}, quit: () => {}, getAutostart: async () => null, setAutostart: async () => null,
      onToggleMute: noop, onQuitRequested: noop, onNavigate: noop
    }
  }
  const create = AudioContext.prototype.createOscillator
  AudioContext.prototype.createOscillator = function () { window.__sounds++; return create.call(this) }
}

async function login(user, initScript) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } })
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  const page = await context.newPage()
  if (initScript) await page.addInitScript(initScript)
  await page.goto(APP + '#/login')
  await page.fill('input[autocomplete=username]', user.email)
  await page.fill('input[type=password]', user.password)
  await page.click('button[type=submit]')
  await page.getByText('Adicionar amigo').first().waitFor({ timeout: 30000 })
  return page
}

try {
  // Ana: Convidar → link → Copiar
  const pageA = await login(ana, fakeDesktop)
  await pageA.goto(APP + `#/servers/${serverId}`)
  await pageA.getByRole('button', { name: 'Convidar', exact: true }).first().click()
  const linkRe = /^https:\/\/app-salinha\.bhrx\.com\.br\/convite\/[A-Z2-9]{8}$/
  const linkEl = pageA.getByLabel('Link de convite')
  await pageA.waitForFunction((re) => new RegExp(re).test(document.querySelector('[aria-label="Link de convite"]')?.value ?? ''), linkRe.source)
  const link = await linkEl.inputValue()
  const code = link.split('/').pop()
  check('ana vê o link de convite do servidor', linkRe.test(link), link)
  await pageA.getByRole('button', { name: 'Copiar' }).click()
  check('copiar põe o link na área de transferência', (await pageA.evaluate(() => navigator.clipboard.readText())) === link)

  // Mesmo código ao abrir de novo (não muda a cada vez)
  const again = (await api(`/servers/${serverId}/invite-code`, { token: ana.token })).body.code
  check('o código é fixo', again === code)
  check('quem não é membro não vê o código', (await api(`/servers/${serverId}/invite-code`, { token: bia.token })).status === 403)
  check('código errado é recusado', (await api('/invites/join', { token: bia.token, method: 'POST', body: { code: 'ZZZZZZZZ' } })).status === 404)

  // Bia: + → Entrar com código (colando o link inteiro)
  const pageB = await login(bia)
  await pageB.getByRole('button', { name: 'Adicionar servidor' }).click()
  const typed = `  ${link}  `
  await pageB.getByLabel('Código ou link de convite').fill(typed)
  await pageB.getByRole('button', { name: 'Entrar', exact: true }).click()
  await pageB.waitForURL((u) => u.hash.includes(`/servers/${serverId}`), { timeout: 15000 })
  check('bia entra no servidor com o link colado', true, typed)
  await pageB.getByTitle(`Turma ${run}`).first().waitFor({ timeout: 10000 })
  check('o servidor aparece na lista da bia', true)

  // Ana vê a Bia entrar (ao vivo, sem recarregar)
  await pageA.getByRole('button', { name: 'Fechar' }).click()
  await pageA.getByText('bia', { exact: true }).first().waitFor({ timeout: 10000 })
  check('ana vê a bia na lista de membros na hora', true)

  // Qualquer membro pode convidar: a Bia (membro comum) vê o botão e o código
  await pageB.getByRole('button', { name: 'Convidar', exact: true }).first().click()
  await pageB.waitForFunction((re) => new RegExp(re).test(document.querySelector('[aria-label="Link de convite"]')?.value ?? ''), linkRe.source)
  check('membro comum também vê o link para convidar', (await pageB.getByLabel('Link de convite').first().inputValue()) === link)
  await pageB.getByRole('button', { name: 'Fechar' }).click()

  // Moderador: a Ana (dona) clica com o botão direito na Bia e promove
  const createChannel = () => api(`/servers/${serverId}/channels`, { token: bia.token, method: 'POST', body: { name: `sala-${Date.now()}`, type: 'text' } })
  check('membro comum não cria canal', (await createChannel()).status === 403)
  await pageA.getByText('bia', { exact: true }).first().click({ button: 'right' })
  await pageA.getByRole('menuitem', { name: 'Tornar moderador' }).click()
  await pageA.getByText('Moderadores — 1').waitFor({ timeout: 10000 })
  check('ana vê a bia em Moderadores', true)
  await pageB.getByText('Moderadores — 1').waitFor({ timeout: 10000 })
  check('a bia também vê na hora (sem recarregar)', true)
  check('moderadora cria canal', (await createChannel()).status === 201)
  const biaId = (await api('/users/me', { token: bia.token })).body.id
  check('moderadora não muda cargos (só a dona)', (await api(`/servers/${serverId}/members/${biaId}/role`, { token: bia.token, method: 'PUT', body: { role: 'member' } })).status === 403)
  await pageA.getByText('bia', { exact: true }).first().click({ button: 'right' })
  await pageA.getByRole('menuitem', { name: 'Remover moderador' }).click()
  await pageA.getByText('Membros — 1').waitFor({ timeout: 10000 })
  check('ana remove o moderador', (await createChannel()).status === 403)

  // Botão direito na Ana (lista de membros): mensagem privada e amizade, sem
  // serem amigas — basta estarem no mesmo servidor.
  await pageB.getByText('ana', { exact: true }).first().click({ button: 'right' })
  await pageB.getByRole('menuitem', { name: 'Enviar mensagem' }).click()
  await pageB.waitForURL((u) => u.hash.includes('/dm/'), { timeout: 10000 })
  const box = pageB.getByPlaceholder(/Mensagem para @ana/)
  await box.fill('oi ana, entrei pelo código!')
  await box.press('Enter')
  const anaConvs = async () => (await api('/conversations', { token: ana.token })).body ?? []
  let got = false
  for (let i = 0; i < 20 && !got; i++) {
    const convs = await anaConvs()
    got = convs.some((c) => c.last_message?.content === 'oi ana, entrei pelo código!')
    if (!got) await new Promise((r) => setTimeout(r, 500))
  }
  check('bia manda mensagem privada para a ana sem serem amigas', got)
  await pageB.goto(APP + `#/servers/${serverId}`)
  await pageB.getByText('ana', { exact: true }).first().click({ button: 'right' })
  await pageB.getByRole('menuitem', { name: 'Adicionar amigo' }).click()
  let pending = ''
  for (let i = 0; i < 20 && !pending.includes(`bia${run}`); i++) {
    pending = JSON.stringify((await api('/friends/pending', { token: ana.token })).body)
    await new Promise((r) => setTimeout(r, 300))
  }
  check('pedido de amizade chega para a ana', pending.includes(`bia${run}`))
  const stranger = await makeUser('estranho')
  const anaId = (await api('/users/me', { token: ana.token })).body.id
  const blocked = await api(`/conversations/with/${anaId}`, { token: stranger.token })
  check('quem não divide servidor nem é amigo não abre DM', blocked.status === 403, blocked.status)

  // @menção: a Bia marca a Ana no #geral; a Ana está em outra tela.
  await pageA.goto(APP + '#/friends')
  await pageB.goto(APP + `#/servers/${serverId}`)
  const input = pageB.getByPlaceholder(/Mensagem para #geral/)
  await input.click()
  await input.pressSequentially('olha @an')
  await pageB.getByRole('listbox', { name: 'Marcar alguém' }).waitFor({ timeout: 5000 })
  check('digitar @ sugere a Ana', (await pageB.getByRole('option').first().textContent()).includes(`@ana${run}`))
  await input.press('Tab')
  check('Tab completa o @nick', (await input.inputValue()) === `olha @ana${run} `)
  const soundsBefore = await pageA.evaluate(() => window.__sounds)
  await input.pressSequentially('isso!')
  await input.press('Enter')
  let notif = []
  for (let i = 0; i < 20 && !notif.length; i++) {
    notif = await pageA.evaluate(() => window.__notifications.filter((n) => n.title.includes('mencionou')))
    if (!notif.length) await new Promise((r) => setTimeout(r, 300))
  }
  check('a Ana recebe notificação do Windows da menção', notif.length === 1, notif)
  check('a notificação abre o canal certo', notif[0]?.route?.startsWith(`/servers/${serverId}/channels/`))
  check('e toca o som de menção', (await pageA.evaluate(() => window.__sounds)) > soundsBefore)
  await pageA.goto(APP + `#/servers/${serverId}`)
  await pageA.getByText('isso!').first().waitFor({ timeout: 10000 })
  const highlighted = await pageA.evaluate(() => {
    const row = [...document.querySelectorAll('p')].find((p) => p.textContent.includes('isso!'))?.closest('.group')
    return row?.className.includes('f0b232') ?? false
  })
  check('a mensagem que menciona a Ana fica destacada para ela', highlighted)

  // Entrar de novo não dá erro nem duplica
  const twice = await api('/invites/join', { token: bia.token, method: 'POST', body: { code } })
  const members = (await api(`/servers/${serverId}`, { token: ana.token })).body.members
  check('entrar de novo não duplica', twice.status === 200 && members.length === 2, members.length)
} catch (err) {
  console.log('FAIL', err.message.split('\n').slice(0, 4).join(' / '))
  process.exitCode = 1
} finally {
  await browser.close()
}
