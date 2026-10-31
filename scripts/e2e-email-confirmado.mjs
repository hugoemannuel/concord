// E2E da confirmação de e-mail no app web. Cobre o "confirmei e o app continua
// pedindo para confirmar" e o link que dava "inválido" logo que chegava:
//
// 1-3. O app relê a conta ao abrir e ao voltar para a janela: quem confirmou em
//      outro navegador deixa de ver o aviso; quem não confirmou continua vendo.
// 4.   Convite: quem confirmou em outro navegador vê "Aceitar como …" e entra.
// 5-8. O link: o do e-mail anterior ao reenvio vale; abrir duas vezes não dá
//      "inválido"; vencido dá; os do endereço antigo (trocou o e-mail), de
//      confirmação e de reset de senha, param de valer.
// 9.   O link vale 24 horas (no banco).
//
// Uso: backend sem SMTP (o link sai no log) com HOST=127.0.0.1 (confia no
// X-Forwarded-For do loopback: cada cadastro vem de um IP, sem bater no limite
// por IP) e o dist-web servido com o proxy do backend:
//   (backend)  HOST=127.0.0.1 SMTP_HOST= go run ./cmd > backend.log 2>&1
//   (frontend) yarn build:web && WEB_BACKEND_URL=http://127.0.0.1:8080 yarn preview:web
//   APP=http://localhost:4173/ BACKEND_LOG=/caminho/backend.log PG_DB=concord \
//     node scripts/e2e-email-confirmado.mjs
// PG_DB (opcional): banco do backend no container concord-postgres (PG_CONTAINER,
// PG_USER), para vencer um link e conferir o prazo; sem ele, 7 e 9 são pulados.
import { execFileSync } from 'child_process'
import { mkdirSync, readFileSync } from 'fs'
import { createRequire } from 'module'
import { tmpdir } from 'os'
import { join } from 'path'
const require = createRequire(new URL('../frontend/package.json', import.meta.url))
const { chromium } = require('playwright')

const APP = process.env.APP ?? 'http://localhost:4173/'
const API = new URL('api', APP).toString()
const SHOTS = process.env.SHOTS ?? join(tmpdir(), 'email-confirmado-shots')
const run = Date.now().toString(36)
const BANNER = /Confirme seu e-mail \(/
mkdirSync(SHOTS, { recursive: true })
if (!process.env.BACKEND_LOG) {
  console.error('Defina BACKEND_LOG: o log do backend sem SMTP, onde saem os links dos e-mails.')
  process.exit(2)
}

let failed = false
function check(desc, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${desc}${detail === undefined ? '' : ': ' + JSON.stringify(detail)}`)
  if (!ok) failed = true
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let nextIp = 1
async function api(path, { token, method = 'GET', body, ip } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  if (ip) headers['X-Forwarded-For'] = ip
  const res = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined })
  const text = await res.text()
  let parsed = text
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    // corpo que não é JSON fica como texto
  }
  return { status: res.status, body: parsed }
}

/** Tokens dos links (confirmação ou reset) mandados ao e-mail, na ordem (o backend sem SMTP imprime no log). */
function linksFor(email, path = 'verify-email') {
  const linkRe = new RegExp(`${path}\\?token=([^\\s]+)`)
  const log = readFileSync(process.env.BACKEND_LOG, 'utf8')
  const marker = `para ${email} —`
  const links = []
  for (let at = log.indexOf(marker); at >= 0; at = log.indexOf(marker, at + marker.length)) {
    const next = log.indexOf('[mailer]', at + marker.length)
    const match = linkRe.exec(log.slice(at, next < 0 ? undefined : next))
    if (match) links.push(decodeURIComponent(match[1]))
  }
  return links
}

async function waitLinks(email, count, path) {
  for (let i = 0; i < 100; i++) {
    const links = linksFor(email, path)
    if (links.length >= count) return links
    await sleep(100)
  }
  throw new Error(`esperava ${count} link(s) para ${email} no log`)
}

async function makeUser(name) {
  const email = `${name}-${run}@teste.dev`
  const password = 'senha-forte-123'
  const res = await api('/auth/register', {
    method: 'POST',
    ip: `198.51.100.${nextIp++}`,
    body: { username: `${name}${run}`, display_name: name, email, password }
  })
  if (res.status >= 300) throw new Error(`cadastro de ${name}: ${res.status} ${JSON.stringify(res.body)}`)
  const me = (await api('/users/me', { token: res.body.access_token })).body
  await waitLinks(email, 1)
  return { name, email, password, token: res.body.access_token, id: me.id }
}

/** Confirma pela API: é o link aberto em outro navegador ou no celular. */
async function confirmElsewhere(user, index = 0) {
  const token = (await waitLinks(user.email, index + 1))[index]
  const res = await api('/auth/verify-email', { method: 'POST', body: { token } })
  if (res.status >= 300) throw new Error(`verify-email de ${user.name}: ${res.status}`)
}

async function verifiedOnServer(user) {
  return (await api('/users/me', { token: user.token })).body?.email_verified
}

function sql(query) {
  const args = ['exec', process.env.PG_CONTAINER ?? 'concord-postgres', 'psql']
  args.push('-U', process.env.PG_USER ?? 'concord-user', '-d', process.env.PG_DB, '-tAc', query)
  return execFileSync('docker', args, { encoding: 'utf8' }).trim()
}

const browser = await chromium.launch({ executablePath: process.env.CHROME })
const errors = []

async function newPage(viewport = { width: 1280, height: 800 }) {
  const context = await browser.newContext({ viewport })
  const page = await context.newPage()
  page.on('pageerror', (e) => errors.push(`pageerror ${e.message}`))
  return page
}

const shot = (page, name) => page.screenshot({ path: join(SHOTS, `${name}.png`) })

// O trilho de servidores existe em qualquer largura (no celular pode estar fora da tela).
const shellReady = (page) =>
  page.getByRole('button', { name: 'Adicionar servidor' }).first().waitFor({ state: 'attached', timeout: 15000 })

async function login(page, user) {
  await page.goto(APP + 'login')
  await page.getByLabel('E-mail ou nome de usuário').fill(user.email)
  await page.getByLabel('Senha', { exact: true }).fill(user.password)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await shellReady(page).catch(async (err) => {
    await shot(page, `falha-login-${user.name}`)
    throw err
  })
}

const bannerVisible = (page) => page.getByText(BANNER).isVisible()
const waitBanner = (page) => page.getByText(BANNER).waitFor({ timeout: 10000 }).then(() => true, () => false)

/** A cópia da conta que o app guarda no navegador. */
const savedVerified = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('concord-auth') ?? '{}').state?.user?.email_verified)

/** Roda `action` e espera o app reler a conta (GET /users/me); null se ele não releu. */
async function withMeFetch(page, action) {
  const me = page
    .waitForResponse((r) => r.url().endsWith('/api/users/me') && r.request().method() === 'GET', { timeout: 6000 })
    .catch(() => null)
  await action()
  const res = await me
  await page.waitForTimeout(300) // o React aplica a conta nova
  return res
}

/** Fechar e abrir o app: recarrega com a conta salva no navegador. */
const reopen = (page) =>
  withMeFetch(page, async () => {
    await page.reload()
    await shellReady(page)
  })

/** Abre o link do e-mail na tela /verify-email: 'ok' (confirmado) ou 'erro'. */
async function openLink(page, token) {
  await page.goto(APP + `verify-email?token=${encodeURIComponent(token)}`)
  const ok = page.getByRole('heading', { name: 'E-mail confirmado!' })
  const bad = page.getByRole('heading', { name: 'Não deu para confirmar' })
  await ok.or(bad).waitFor({ timeout: 15000 })
  return (await ok.isVisible()) ? 'ok' : 'erro'
}

try {
  // 1. Confirmou em outro navegador e abriu o app de novo.
  const ana = await makeUser('ana')
  const p1 = await newPage()
  await login(p1, ana)
  check('1. logada sem confirmar: o aviso aparece', await waitBanner(p1))
  check('1. a cópia salva diz "não confirmado"', (await savedVerified(p1)) === false)
  await shot(p1, '01a-aviso')
  await confirmElsewhere(ana)
  await reopen(p1)
  check('1. confirmou em outro navegador e abriu o app de novo: o aviso some', !(await bannerVisible(p1)))
  check('1. a cópia salva passa a "confirmado"', (await savedVerified(p1)) === true)
  await shot(p1, '01b-sem-aviso')

  // 2. Confirmou e voltou para a janela, sem recarregar.
  const bia = await makeUser('bia')
  const p2 = await newPage()
  await login(p2, bia)
  await waitBanner(p2)
  await confirmElsewhere(bia)
  await withMeFetch(p2, () => p2.evaluate(() => window.dispatchEvent(new Event('focus'))))
  check('2. confirmou e voltou para a janela: o aviso some sem recarregar', !(await bannerVisible(p2)))

  // 3. Não confirmou: o aviso continua.
  const caio = await makeUser('caio')
  const p3 = await newPage()
  await login(p3, caio)
  await waitBanner(p3)
  await reopen(p3)
  check('3. não confirmou e abriu o app de novo: o aviso continua', await bannerVisible(p3))
  await p3.getByRole('button', { name: 'Configurações do usuário' }).click()
  await p3.getByRole('button', { name: 'Sair', exact: true }).click()
  await p3.waitForURL((u) => u.pathname === '/login', { timeout: 15000 })
  await login(p3, caio)
  check('3. não confirmou, saiu e entrou de novo: o aviso continua', await waitBanner(p3))
  // No celular o aviso fica na coluna do conteúdo (na lista inicial ela está fora da tela).
  const p3m = await newPage({ width: 360, height: 740 })
  await login(p3m, caio)
  const inContent = p3m.getByRole('button', { name: 'Voltar para canais e conversas' })
  if (!(await inContent.isVisible())) await p3m.locator('text="Amigos" >> visible=true').first().click()
  check('3. 360 px, tela de amigos: o aviso aparece', await waitBanner(p3m))
  await shot(p3m, '03-aviso-360px')

  // 4. Convite: confirmou em outro navegador e abriu o link do convite.
  const dono = await makeUser('dono')
  await confirmElsewhere(dono)
  const server = (await api('/servers', { token: dono.token, method: 'POST', body: { name: `Turma ${run}` } })).body
  const code = (await api(`/servers/${server.id}/invite-code`, { token: dono.token })).body.code
  const duda = await makeUser('duda')
  const p4 = await newPage()
  await login(p4, duda)
  await waitBanner(p4)
  await confirmElsewhere(duda)
  await p4.goto(APP + `convite/${code}`)
  await p4.getByRole('button', { name: 'Continuar no Navegador' }).click()
  const accept = p4.getByRole('button', { name: `Aceitar como ${duda.name}` })
  const canAccept = await accept.waitFor({ timeout: 10000 }).then(() => true, () => false)
  check('4. confirmou e abriu o convite: "Aceitar como …" (não "Confirme seu e-mail")', canAccept)
  await shot(p4, '04-convite')
  if (canAccept) {
    await accept.click()
    const entered = await p4
      .waitForURL((u) => u.pathname.startsWith(`/servers/${server.id}`), { timeout: 15000 })
      .then(() => true, () => false)
    check('4. aceitou e entrou no servidor', entered, p4.url())
  }

  const outside = await newPage() // outro navegador, sem login

  // 5. Pediu reenvio e clicou no link do primeiro e-mail.
  const eva = await makeUser('eva')
  const resent = await api('/auth/resend-verification', { token: eva.token, method: 'POST' })
  check('5. reenvio aceito', resent.status === 200 && resent.body?.sent === true, resent)
  const [first] = await waitLinks(eva.email, 2)
  check('5. link do primeiro e-mail, depois do reenvio: "E-mail confirmado!"', (await openLink(outside, first)) === 'ok')
  await shot(outside, '05-primeiro-link')
  check('5. a conta ficou confirmada', (await verifiedOnServer(eva)) === true)

  // 6. O mesmo link aberto duas vezes (duas abas, app do e-mail e depois o navegador).
  const [caioLink] = await waitLinks(caio.email, 1)
  check('6. primeira abertura: "E-mail confirmado!"', (await openLink(outside, caioLink)) === 'ok')
  check('6. segunda abertura do mesmo link: "E-mail confirmado!"', (await openLink(outside, caioLink)) === 'ok')
  await shot(outside, '06-segunda-abertura')
  check('6. a conta ficou confirmada', (await verifiedOnServer(caio)) === true)

  // 7. Link vencido: continua dando "inválido".
  if (process.env.PG_DB) {
    const fabi = await makeUser('fabi')
    sql(`UPDATE email_tokens SET expires_at = NOW() - INTERVAL '1 minute' WHERE user_id = '${fabi.id}'`)
    const [expired] = await waitLinks(fabi.email, 1)
    check('7. link vencido: "Não deu para confirmar"', (await openLink(outside, expired)) === 'erro')
    check('7. mensagem de link inválido ou vencido', await outside.getByText('Este link é inválido ou expirou').isVisible())
    await shot(outside, '07-vencido')
    check('7. a conta continua sem confirmar', (await verifiedOnServer(fabi)) === false)
  } else {
    console.log('SKIP 7. link vencido (sem PG_DB)')
  }

  // 8. Trocou o e-mail: o link do endereço antigo para de valer; o do novo vale.
  const gabi = await makeUser('gabi')
  const [oldLink] = await waitLinks(gabi.email, 1)
  await api('/auth/forgot-password', { method: 'POST', body: { email: gabi.email } })
  const [oldReset] = await waitLinks(gabi.email, 1, 'reset-password')
  const newEmail = `gabi-novo-${run}@teste.dev`
  const changed = await api('/users/me/email', {
    token: gabi.token,
    method: 'PUT',
    body: { email: newEmail, password: gabi.password }
  })
  check('8. troca de e-mail aceita', changed.status === 200, changed.status)
  const [newLink] = await waitLinks(newEmail, 1)
  check('8. link do endereço antigo: "Não deu para confirmar"', (await openLink(outside, oldLink)) === 'erro')
  check('8. o link antigo não confirma o endereço novo', (await verifiedOnServer(gabi)) === false)
  const oldResetUse = await api('/auth/reset-password', {
    method: 'POST',
    body: { token: oldReset, password: 'outra-senha-123' }
  })
  check('8. reset de senha mandado ao endereço antigo: recusado', oldResetUse.status === 400, oldResetUse.status)
  check('8. o reset antigo não confirma o endereço novo', (await verifiedOnServer(gabi)) === false)
  check('8. link do endereço novo: "E-mail confirmado!"', (await openLink(outside, newLink)) === 'ok')

  // 9. Prazo do link no banco.
  if (process.env.PG_DB) {
    const seconds = Number(
      sql(`SELECT round(EXTRACT(EPOCH FROM expires_at - created_at)) FROM email_tokens
        WHERE user_id = '${ana.id}' AND purpose = 'verify_email' ORDER BY created_at LIMIT 1`)
    )
    check('9. o link de confirmação vale 24 horas', Math.abs(seconds - 86400) <= 60, seconds)
  } else {
    console.log('SKIP 9. prazo do link (sem PG_DB)')
  }

  check('sem erros de página', errors.length === 0, errors)
} catch (err) {
  check('o roteiro chegou ao fim', false, String(err?.stack ?? err))
} finally {
  await browser.close()
}

console.log(`\nscreenshots em ${SHOTS}`)
process.exit(failed ? 1 : 0)
