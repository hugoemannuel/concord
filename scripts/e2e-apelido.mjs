// E2E do apelido no servidor (yarn build:web): um moderador muda o apelido de
// um membro pelo menu da lista de membros e os dois clientes veem o nome novo
// na hora, no chat e na lista; em DM continua o nome de exibição. Também
// confere pela API que membro comum não muda o apelido dos outros. Use um
// banco descartável (cria usuários e um servidor).
// Uso: backend rodando e o dist-web servido com o proxy do backend:
//   (frontend) yarn build:web && WEB_BACKEND_URL=http://localhost:8080 yarn preview:web
//   APP=http://localhost:4173/ BACKEND_LOG=<saída do backend> SHOTS=/tmp/apelido node scripts/e2e-apelido.mjs
import { mkdirSync } from 'fs'
import { createRequire } from 'module'
import { createE2E } from './lib/e2e.mjs'
const require = createRequire(new URL('../frontend/package.json', import.meta.url))
const { chromium } = require('playwright')

const APP = process.env.APP ?? 'http://localhost:4173/'
const API = new URL('api', APP).toString()
const SHOTS = process.env.SHOTS ?? '/tmp/salinha-e2e-apelido'
mkdirSync(SHOTS, { recursive: true })
const run = Date.now().toString(36)
// request: devolve { status, body } sem lançar (o teste confere os 403).
const { request: api, makeUser } = createE2E({ api: API, run })
const NICK = 'Bibi Apelidada'

const failures = []
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'OK  ' : 'FAIL'} ${name}${cond ? '' : '  ' + extra}`)
  if (!cond) failures.push(name)
}

const dono = await makeUser('dono')
const mod = await makeUser('mod')
const bia = await makeUser('bia')
const { body: server } = await api('/servers', { token: dono.token, method: 'POST', body: { name: `Apelidos ${run}` } })
const sid = server.id
const { body: code } = await api(`/servers/${sid}/invite-code`, { token: dono.token })
for (const u of [mod, bia]) await api('/invites/join', { token: u.token, method: 'POST', body: { code: code.code } })
const { body: detail } = await api(`/servers/${sid}`, { token: dono.token })
const modRole = detail.roles.find((r) => r.name === 'Moderador')
await api(`/servers/${sid}/members/${mod.id}/roles/${modRole.id}`, { token: dono.token, method: 'PUT' })
const { body: channels } = await api(`/servers/${sid}/channels`, { token: dono.token })
const geral = channels.find((c) => c.name === 'geral')
await api(`/channels/${geral.id}/messages`, { token: bia.token, method: 'POST', body: { content: `oi, sou a bia ${run}` } })
// Amizade + DM para conferir que o apelido não vaza para a DM.
await api('/friends/request', { token: mod.token, method: 'POST', body: { username: bia.username } })
await api(`/friends/${mod.username}/accept`, { token: bia.token, method: 'PUT' })
console.log('setup ok', { sid, geral: geral.id })

// Permissões pela API: membro comum não muda o apelido dos outros nem o do dono.
const biaOnMod = await api(`/servers/${sid}/members/${mod.id}/nickname`, { token: bia.token, method: 'PUT', body: { nickname: 'x' } })
check('membro comum não muda o apelido do moderador', biaOnMod.status === 403 && biaOnMod.body?.code === 'missing_permission', JSON.stringify(biaOnMod))
const modOnDono = await api(`/servers/${sid}/members/${dono.id}/nickname`, { token: mod.token, method: 'PUT', body: { nickname: 'x' } })
check('moderador não muda o apelido do dono', modOnDono.status === 403 && modOnDono.body?.code === 'role_hierarchy', JSON.stringify(modOnDono))
const tooLong = await api(`/servers/${sid}/members/${bia.id}/nickname`, { token: bia.token, method: 'PUT', body: { nickname: 'a'.repeat(33) } })
check('apelido com 33 caracteres é recusado', tooLong.status === 400 && tooLong.body?.code === 'invalid_nickname', JSON.stringify(tooLong))

const browser = await chromium.launch({ executablePath: process.env.CHROME })
const errors = []
async function openClient(user, path) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
  const page = await context.newPage()
  page.on('pageerror', (e) => errors.push(`[${user.name}] pageerror ${e.message}`))
  await page.goto(APP + 'login')
  await page.fill('input[autocomplete=username]', user.email)
  await page.fill('input[type=password]', user.password)
  await page.click('button[type=submit]')
  await page.getByText('Adicionar amigo').first().waitFor({ timeout: 30000 })
  await page.goto(APP + path)
  return page
}

const memberName = (page, name) => page.locator('aside p[title]').filter({ hasText: new RegExp(`^${name}$`) })
const authorName = (page, name) => page.locator('[id^="msg-"] button').filter({ hasText: new RegExp(`^${name}$`) })

try {
  const path = `servers/${sid}/channels/${geral.id}`
  const pageMod = await openClient(mod, path)
  const pageBia = await openClient(bia, path)
  for (const page of [pageMod, pageBia]) await memberName(page, 'bia').first().waitFor({ timeout: 20000 })
  check('antes: a bia aparece como "bia" no chat', (await authorName(pageBia, 'bia').count()) > 0)

  // O moderador abre o menu da bia na lista de membros e muda o apelido.
  await memberName(pageMod, 'bia').first().click({ button: 'right' })
  await pageMod.getByRole('menuitem', { name: 'Alterar apelido' }).click()
  await pageMod.locator('#nickname-input').fill(NICK)
  await pageMod.screenshot({ path: `${SHOTS}/1-modal-moderador.png` })
  await pageMod.getByRole('button', { name: 'Salvar' }).click()

  for (const [who, page] of [['moderador', pageMod], ['bia', pageBia]]) {
    await memberName(page, NICK).first().waitFor({ timeout: 10000 }).catch(() => {})
    check(`${who} vê o apelido na lista de membros`, (await memberName(page, NICK).count()) === 1)
    check(`${who} vê o apelido no autor da mensagem`, (await authorName(page, NICK).count()) > 0)
    check(`${who} não vê mais "bia" na lista`, (await memberName(page, 'bia').count()) === 0)
  }
  await pageMod.screenshot({ path: `${SHOTS}/2-moderador-depois.png` })
  await pageBia.screenshot({ path: `${SHOTS}/3-bia-depois.png` })

  // Cartão de perfil: apelido em destaque, nome de verdade e @ embaixo.
  await memberName(pageMod, NICK).first().click()
  const card = pageMod.getByRole('dialog', { name: `Perfil de ${NICK}` })
  await card.waitFor({ timeout: 10000 })
  const cardText = await card.innerText()
  check('cartão mostra apelido, nome de exibição e @', cardText.includes(NICK) && cardText.includes('bia') && cardText.includes(bia.username), cardText.slice(0, 200))
  await pageMod.screenshot({ path: `${SHOTS}/4-cartao-perfil.png` })
  await pageMod.keyboard.press('Escape')

  // Autocompletar do @: casa pelo apelido e escreve o @username.
  const composer = pageMod.locator('form input[type=text], form input:not([type])').last()
  await composer.click()
  await composer.pressSequentially('@bibi')
  const option = pageMod.getByRole('option').filter({ hasText: NICK })
  await option.first().waitFor({ timeout: 5000 }).catch(() => {})
  check('autocompletar acha a bia pelo apelido', (await option.count()) === 1)
  await pageMod.screenshot({ path: `${SHOTS}/5-mencao.png` })
  await pageMod.keyboard.press('Tab')
  check('escolher a sugestão escreve o @username', (await composer.inputValue()).startsWith(`@${bia.username} `), await composer.inputValue())

  // Em DM o apelido não vale.
  const { body: conv } = await api(`/conversations/with/${mod.id}`, { token: bia.token })
  await api(`/conversations/${conv.id}/messages`, { token: bia.token, method: 'POST', body: { content: `oi na DM ${run}` } })
  await pageMod.goto(APP + `dm/${bia.id}`)
  await authorName(pageMod, 'bia').first().waitFor({ timeout: 10000 }).catch(() => {})
  const dmText = await pageMod.locator('body').innerText()
  check('na DM a bia aparece pelo nome de exibição, sem apelido', (await authorName(pageMod, 'bia').count()) > 0 && !dmText.includes(NICK))
  await pageMod.screenshot({ path: `${SHOTS}/6-dm-sem-apelido.png` })

  // A própria bia redefine (tira) o apelido pelo menu do servidor.
  await pageBia.locator('button', { hasText: '▼' }).filter({ hasText: `Apelidos ${run}` }).click()
  await pageBia.getByRole('button', { name: 'Alterar apelido' }).click()
  await pageBia.getByRole('button', { name: 'Redefinir' }).click()
  await memberName(pageBia, 'bia').first().waitFor({ timeout: 10000 }).catch(() => {})
  check('redefinir volta ao nome de exibição', (await memberName(pageBia, 'bia').count()) === 1 && (await memberName(pageBia, NICK).count()) === 0)
  await pageBia.screenshot({ path: `${SHOTS}/7-bia-redefiniu.png` })
} catch (err) {
  failures.push(String(err))
  console.error(err)
} finally {
  await browser.close()
}

if (errors.length) console.log('erros da página:', errors)
console.log(failures.length ? 'FALHAS: ' + failures.join(' | ') : 'TUDO OK')
process.exit(failures.length ? 1 : 0)
