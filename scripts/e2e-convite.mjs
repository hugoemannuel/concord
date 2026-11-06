// E2E do link de convite no app web: /convite/<código> deslogado mostra o
// cartão do servidor; "Abrir aplicativo" sem app oferece o download;
// "Continuar no Navegador" passa pelo cadastro sem perder o código e abre a
// confirmação "Aceitar como …", que entra no servidor. Também: já membro,
// código inválido, banido e o limite por IP da prévia.
// Uso: backend rodando e o dist-web servido com o proxy do backend:
//   (frontend) yarn build:web && WEB_BACKEND_URL=http://localhost:8080 yarn preview:web
//   APP=http://localhost:4173/ BACKEND_LOG=/caminho/backend.log node scripts/e2e-convite.mjs
// BACKEND_LOG: log do backend sem SMTP (o link de confirmação de e-mail sai lá).
import { mkdirSync } from 'fs'
import { createRequire } from 'module'
import { deflateSync } from 'zlib'
import { createE2E } from './lib/e2e.mjs'
const require = createRequire(new URL('../frontend/package.json', import.meta.url))
const { chromium } = require('playwright')

const APP = process.env.APP ?? 'http://localhost:4173/'
const API = new URL('api', APP).toString()
const SHOTS = process.env.SHOTS ?? new URL('../convite-shots/', import.meta.url).pathname
const run = Date.now().toString(36)
const { request: api, makeUser, verifyEmail } = createE2E({ api: API, run })
mkdirSync(SHOTS, { recursive: true })

// Ícone de teste (PNG em degradê, como data: URL — sem depender da internet).
function gradientPng(size) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc = (buf) => {
    let c = 0xffffffff
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type), data])
    const c = Buffer.alloc(4)
    c.writeUInt32BE(crc(td))
    return Buffer.concat([len, td, c])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  const rows = []
  for (let y = 0; y < size; y++) {
    const row = [0]
    for (let x = 0; x < size; x++) row.push(240 - y, 80 + x, 60 + (x + y) / 2)
    rows.push(Buffer.from(row))
  }
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0))
  ])
  return `data:image/png;base64,${png.toString('base64')}`
}

let failed = false
function check(desc, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${desc}${detail === undefined ? '' : ': ' + JSON.stringify(detail)}`)
  if (!ok) failed = true
}

const ana = await makeUser('ana')
const carol = await makeUser('carol')
const serverName = `Turma ${run}`
const server = (await api('/servers', { token: ana.token, method: 'POST', body: { name: serverName, icon_url: gradientPng(96) } })).body
const plain = (await api('/servers', { token: ana.token, method: 'POST', body: { name: `Sem ícone ${run}` } })).body
const code = (await api(`/servers/${server.id}/invite-code`, { token: ana.token })).body.code
const plainCode = (await api(`/servers/${plain.id}/invite-code`, { token: ana.token })).body.code
check('ban da carol antes de ela entrar', (await api(`/servers/${server.id}/bans`, { token: ana.token, method: 'POST', body: { user_id: carol.id } })).status < 300)

// Prévia pública: só o necessário, sem login.
const preview = await api(`/invites/${code.toLowerCase()}/preview`)
check('prévia sem login responde 200', preview.status === 200, preview.status)
check('prévia anônima só com campos públicos (sem id)', JSON.stringify(Object.keys(preview.body).sort()) === JSON.stringify(['icon_url', 'member_count', 'name', 'online_count']), Object.keys(preview.body))
const signedPreview = (await api(`/invites/${code}/preview`, { token: ana.token })).body
check('logado recebe id e se já é membro', signedPreview.server_id === server.id && signedPreview.is_member === true, { id: signedPreview.server_id, is_member: signedPreview.is_member })
check('prévia conta 1 membro', preview.body.member_count === 1, preview.body.member_count)
check('código inexistente é 404', (await api('/invites/ZZZZ2222/preview')).status === 404)
check('código malformado é 404', (await api('/invites/abc!/preview')).status === 404)

const browser = await chromium.launch({ executablePath: process.env.CHROME })
const errors = []
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
const page = await context.newPage()
page.on('pageerror', (e) => errors.push(`pageerror ${e.message}`))
const shot = (name) => page.screenshot({ path: `${SHOTS}/${name}.png` })

try {
  // 1. Deslogado: cartão do convite.
  await page.goto(APP + `convite/${code}`)
  await page.getByText('Você foi convidado(a) para entrar').waitFor({ timeout: 15000 })
  check('cartão mostra o nome do servidor', await page.getByRole('heading', { name: serverName }).isVisible())
  check('cartão mostra membros', await page.getByText('1 membro', { exact: true }).isVisible())
  check('cartão mostra online', await page.getByText(/^\d+ online$/).isVisible())
  await shot('01-landing')

  // 2. "Abrir aplicativo" sem o app: depois de ~1,5 s, oferece o download.
  // Numa aba à parte: no Chrome headless o salinha:// sem app fica pendurado
  // esperando o "Abrir Salinha?" (que não aparece) e segura os cliques da aba.
  const appTab = await context.newPage()
  await appTab.goto(APP + `convite/${code}`)
  await appTab.getByRole('button', { name: 'Abrir aplicativo' }).click()
  await appTab.getByText('Não abriu?').waitFor({ timeout: 5000 })
  const download = await appTab.getByRole('link', { name: 'Baixe o app' }).getAttribute('href')
  check('link de download', download === 'https://salinha.bhrx.com.br', download)
  check('continua na página do convite', new URL(appTab.url()).pathname === `/convite/${code}`, appTab.url())
  await appTab.screenshot({ path: `${SHOTS}/02-nao-abriu.png` })
  await appTab.close()

  // 3. "Continuar no Navegador" → login → cadastro, levando o código.
  await page.getByRole('button', { name: 'Continuar no Navegador' }).click()
  await page.waitForURL((u) => u.pathname === '/login' && u.searchParams.get('convite') === code)
  check('login avisa do convite', await page.getByText('Entre na sua conta para aceitar o convite.').isVisible())
  await page.getByRole('link', { name: 'Registre-se' }).click()
  await page.waitForURL((u) => u.pathname === '/register' && u.searchParams.get('convite') === code)
  await page.reload()
  check('o código sobrevive ao recarregar o cadastro', new URL(page.url()).searchParams.get('convite') === code)
  await page.getByLabel('Nome de usuário').fill(`bia${run}`)
  await page.getByLabel('Nome de exibição').fill('Bia')
  await page.getByLabel('E-mail').fill(`bia-${run}@teste.dev`)
  await page.getByLabel('Senha', { exact: true }).fill('senha-forte-123')
  await page.getByLabel('Confirmar senha').fill('senha-forte-123')
  await shot('03-cadastro')
  await page.getByRole('button', { name: 'Continuar', exact: true }).click()

  // 4. Conta nova: entrar em servidor pede o e-mail confirmado.
  await page.getByRole('button', { name: 'Já confirmei' }).waitFor({ timeout: 15000 })
  check('conta nova vê "Confirme seu e-mail"', await page.getByText(/Confirme seu e-mail/).first().isVisible())
  await page.waitForTimeout(300)
  await shot('04a-confirme-email')
  await verifyEmail(`bia-${run}@teste.dev`)
  await page.getByRole('button', { name: 'Já confirmei' }).click()

  // Confirmação "Aceitar como Bia".
  const accept = page.getByRole('button', { name: 'Aceitar como Bia' })
  await accept.waitFor({ timeout: 15000 })
  const dialog = page.getByRole('dialog', { name: `Convite para ${serverName}` })
  check('confirmação mostra o servidor', await dialog.getByRole('heading', { name: serverName }).isVisible())
  check('confirmação tem "Não, obrigado"', await dialog.getByRole('button', { name: 'Não, obrigado' }).isVisible())
  await page.waitForTimeout(400)
  await shot('04-confirmacao')

  // 5. Aceitar → entra e abre o servidor.
  await accept.click()
  await page.waitForURL((u) => u.pathname.startsWith(`/servers/${server.id}`), { timeout: 15000 })
  check('aceitar abre o servidor', true, page.url())
  check('confirmação fecha', (await page.getByRole('dialog').count()) === 0)
  const after = await api(`/invites/${code}/preview`)
  check('agora são 2 membros', after.body.member_count === 2, after.body)
  await page.waitForTimeout(800)
  await shot('05-no-servidor')

  // 6. Já membro: "Você já está neste servidor" → Abrir servidor.
  await page.goto(APP + `convite/${code}`)
  await page.getByRole('button', { name: 'Continuar no Navegador' }).click()
  await page.getByText('Você já está neste servidor').waitFor({ timeout: 15000 })
  await page.waitForTimeout(300)
  await shot('06-ja-membro')
  await page.getByRole('button', { name: 'Abrir servidor' }).click()
  await page.waitForURL((u) => u.pathname.startsWith(`/servers/${server.id}`), { timeout: 15000 })
  check('"Abrir servidor" leva ao servidor', true)

  // 7. "Não, obrigado" fecha sem entrar (servidor sem ícone: degradê).
  await page.goto(APP + `convite/${plainCode}`)
  await page.getByRole('button', { name: 'Continuar no Navegador' }).click()
  await page.getByRole('button', { name: 'Aceitar como Bia' }).waitFor({ timeout: 15000 })
  await page.waitForTimeout(300)
  await shot('07-confirmacao-sem-icone')
  await page.getByRole('button', { name: 'Não, obrigado' }).click()
  check('"Não, obrigado" fecha', (await page.getByRole('dialog').count()) === 0)
  check('"Não, obrigado" não entra', (await api(`/invites/${plainCode}/preview`)).body.member_count === 1)

  // 8. Código inválido.
  await page.goto(APP + 'convite/ZZZZ2222')
  await page.getByText('Este convite é inválido ou expirou.').waitFor({ timeout: 15000 })
  await shot('08-invalido')

  // 9. Banido: a carol entra pelo link e é recusada.
  const carolCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const carolPage = await carolCtx.newPage()
  await carolPage.goto(APP + `login?convite=${code}`)
  await carolPage.fill('input[autocomplete=username]', carol.email)
  await carolPage.fill('input[type=password]', carol.password)
  await carolPage.click('button[type=submit]')
  await carolPage.getByRole('button', { name: 'Aceitar como carol' }).waitFor({ timeout: 15000 })
  await carolPage.getByRole('button', { name: 'Aceitar como carol' }).click({ timeout: 15000 })
  await carolPage.getByText('Você foi banido deste servidor.').waitFor({ timeout: 10000 })
  check('banido vê o aviso', true)
  check('banido não vê mais o "Aceitar"', (await carolPage.getByRole('button', { name: 'Aceitar como carol' }).count()) === 0)
  await carolPage.screenshot({ path: `${SHOTS}/09-banido.png` })

  // 10. Servidor sem ícone no cartão do navegador (degradê no fundo).
  const anon = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const anonPage = await anon.newPage()
  await anonPage.goto(APP + `convite/${plainCode}`)
  await anonPage.getByText('Você foi convidado(a) para entrar').waitFor({ timeout: 15000 })
  await anonPage.screenshot({ path: `${SHOTS}/10-landing-sem-icone.png` })
  // Celular.
  await anonPage.setViewportSize({ width: 390, height: 780 })
  await anonPage.goto(APP + `convite/${code}`)
  await anonPage.getByText('Você foi convidado(a) para entrar').waitFor({ timeout: 15000 })
  await anonPage.screenshot({ path: `${SHOTS}/11-landing-celular.png` })

  // 11. "Gerar novo link" (a Bia, membro comum, pode convidar): o link
  // antigo para de funcionar na hora.
  await page.goto(APP + `servers/${server.id}`)
  await page.getByRole('button', { name: 'Convidar', exact: true }).first().click()
  const linkBox = page.getByLabel('Link de convite')
  await page.waitForFunction((c) => document.querySelector('[aria-label="Link de convite"]')?.value.endsWith(`/convite/${c}`), code)
  await page.getByRole('button', { name: 'Gerar novo link' }).click()
  await page.getByText('O link atual para de funcionar na hora').waitFor({ timeout: 5000 })
  await shot('12-gerar-novo-link')
  await page.getByRole('dialog', { name: 'Gerar novo link?' }).getByRole('button', { name: 'Gerar novo link' }).click()
  await page.waitForFunction((c) => {
    const v = document.querySelector('[aria-label="Link de convite"]')?.value ?? ''
    return /\/convite\/[A-Z2-9]{8}$/.test(v) && !v.endsWith(`/convite/${c}`)
  }, code)
  const newCode = (await linkBox.inputValue()).split('/').pop()
  check('o link mudou na tela', newCode !== code, newCode)
  check('o link antigo deixa de valer na hora', (await api(`/invites/${code}/preview`)).status === 404)
  check('o link novo vale', (await api(`/invites/${newCode}/preview`)).status === 200)
  const noPerm = await api(`/servers/${server.id}/invite-code/reset`, { token: carol.token, method: 'POST' })
  check('quem não é membro não gera link', noPerm.status === 403, noPerm.status)

  // 12. Limite por IP da prévia (por último: gasta a cota deste IP).
  let limited = null
  for (let i = 0; i < 80 && !limited; i++) {
    const res = await fetch(`${API}/invites/${newCode}/preview`)
    if (res.status === 429) limited = res.headers.get('retry-after')
  }
  check('prévia tem limite por IP (429 + Retry-After)', Boolean(limited), limited)
} catch (err) {
  failed = true
  console.log('FAIL', err.message)
  await shot('erro').catch(() => {})
} finally {
  check('sem erros na página', errors.length === 0, errors)
  await browser.close()
}

process.exit(failed ? 1 : 0)
