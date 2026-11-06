// E2E da "piscada" ao convidar amigos: Ana cria um servidor, abre "Convidar" e
// convida três amigos seguidos. Entre um convite e outro a tela não pode
// trocar pelo "Carregando servidor...", nem fechar e reabrir o modal (era o
// que fazia a tela toda piscar).
// Uso: backend rodando + app web servido com o proxy do backend:
//   (frontend) WEB_BACKEND_URL=http://localhost:8080 yarn dev:web
//   APP=http://localhost:5175/ BACKEND_LOG=<saída do backend> node scripts/e2e-invite-flash.mjs
// LATENCY_MS (padrão 150) atrasa as respostas do GET /servers/:id, como numa
// rede de verdade — no localhost o carregando dura um frame só.
import { createRequire } from 'module'
import { createE2E } from './lib/e2e.mjs'
const require = createRequire(new URL('../frontend/package.json', import.meta.url))
const { chromium } = require('playwright')

const APP = process.env.APP ?? 'http://localhost:5175/'
const API = new URL('api', APP).toString()
const LATENCY_MS = Number(process.env.LATENCY_MS ?? 150)
const run = Date.now().toString(36)
const { api, makeUser } = createE2E({ api: API, run })

let failed = false
function check(desc, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${desc}${detail === undefined ? '' : ': ' + JSON.stringify(detail)}`)
  if (!ok) failed = true
}

const ana = await makeUser('ana')
const friends = [await makeUser('bia'), await makeUser('caio'), await makeUser('duda')]
for (const f of friends) {
  await api('/friends/request', { token: ana.token, method: 'POST', body: { username: f.username } })
  await api(`/friends/${ana.username}/accept`, { token: f.token, method: 'PUT' })
}
const server = await api('/servers', { token: ana.token, method: 'POST', body: { name: `Turma ${run}` } })
const serverId = server.id ?? server.server?.id

const browser = await chromium.launch({ executablePath: process.env.CHROME })
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  // Rede de verdade: o GET do servidor demora um pouco.
  await page.route(new RegExp(`/api/servers/${serverId}$`), async (route) => {
    if (route.request().method() === 'GET') await new Promise((r) => setTimeout(r, LATENCY_MS))
    await route.continue()
  })

  await page.goto(APP + 'login')
  await page.fill('input[autocomplete=username]', ana.email)
  await page.fill('input[type=password]', ana.password)
  await page.click('button[type=submit]')
  await page.getByText('Adicionar amigo').first().waitFor({ timeout: 30000 })

  await page.goto(APP + `servers/${serverId}`)
  await page.getByRole('button', { name: 'Convidar', exact: true }).first().click()
  await page.getByRole('dialog').waitFor({ timeout: 10000 })
  for (const f of friends) await page.getByText(`@${f.username}`).waitFor({ timeout: 10000 })

  // Grava toda vez que o modal ou o cabeçalho do servidor saem do DOM, ou o
  // "Carregando servidor..." aparece. Um MutationObserver vê cada commit do
  // React, mesmo os que duram um frame.
  await page.evaluate(() => {
    window.__flash = { dialogRemoved: 0, headerRemoved: 0, loaderShown: 0 }
    const header = () => document.querySelector('main header')
    let lastHeader = header()
    let lastDialog = document.querySelector('[role=dialog]')
    new MutationObserver(() => {
      const d = document.querySelector('[role=dialog]')
      const h = header()
      if (lastDialog && d !== lastDialog) window.__flash.dialogRemoved++
      if (lastHeader && h !== lastHeader) window.__flash.headerRemoved++
      if ((document.querySelector('main')?.textContent ?? '').includes('Carregando servidor')) {
        window.__flash.loaderShown++
      }
      lastDialog = d
      lastHeader = h
    }).observe(document.body, { childList: true, subtree: true, characterData: true })
  })

  const dialog = page.getByRole('dialog')
  for (const f of friends) {
    const row = dialog.locator('div.rounded-xl', { hasText: `@${f.username}` })
    await row.getByRole('button', { name: 'Convidar' }).click()
    await row.getByText('Convite pendente').waitFor({ timeout: 10000 })
    // Dá tempo ao refetch do servidor (com a latência) terminar.
    await page.waitForTimeout(LATENCY_MS + 300)
  }

  const flash = await page.evaluate(() => window.__flash)
  console.log('mutações gravadas durante os 3 convites:', JSON.stringify(flash))
  check('o "Carregando servidor..." não aparece entre os convites', flash.loaderShown === 0, flash.loaderShown)
  check('o modal de convite não fecha e reabre', flash.dialogRemoved === 0, flash.dialogRemoved)
  check('o cabeçalho do servidor não é remontado', flash.headerRemoved === 0, flash.headerRemoved)
  const pending = (await api(`/servers/${serverId}/invites`, { token: ana.token })) ?? []
  check('os três convites foram enviados', pending.length === 3, pending.length)
  check('sem erros na página', errors.length === 0, errors)
} finally {
  await browser.close()
}
process.exit(failed ? 1 : 0)
