// E2E: cancelar o seletor de tela não pode derrubar o processo main.
// Uso: backend + LiveKit rodando e o app buildado (cd frontend && npx electron-vite build).
//   API=http://localhost:8080/api node scripts/e2e-screen-cancel.mjs
// Abre o app Electron de verdade (Playwright), entra num canal de voz e:
// 1) Compartilhar tela → Cancelar; 2) → Esc; 3) → Compartilhar (tem que funcionar).
// Falha se o processo main registrar qualquer exceção não tratada, ou se
// aparecer o toast de erro ao cancelar.
import { createRequire } from 'module'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { createE2E } from './lib/e2e.mjs'

const frontend = fileURLToPath(new URL('../frontend', import.meta.url))
const require = createRequire(join(frontend, 'package.json'))
const { _electron: electron } = require('playwright')

const API = process.env.API ?? 'http://localhost:8080/api'
const run = Date.now().toString(36)
const { api } = createE2E({ api: API, run })

const email = `tela-${run}@teste.dev`
const password = 'senha-forte-123'
const { access_token: token } = await api('/auth/register', {
  method: 'POST',
  body: { username: `tela${run}`, display_name: 'tela', email, password }
})
const server = await api('/servers', { token, method: 'POST', body: { name: `Tela ${run}` } })
const serverId = server.id ?? server.server?.id
await api(`/servers/${serverId}/channels`, { token, method: 'POST', body: { name: 'voz-tela', type: 'voice' } })

function check(desc, ok, detail) {
  if (!ok) throw new Error(`FAIL ${desc}: ${JSON.stringify(detail)}`)
  console.log(`PASS ${desc}:`, JSON.stringify(detail))
}

// Perfil próprio: não colide com o Concord instalado (instância única).
const userDataDir = mkdtempSync(join(tmpdir(), 'concord-e2e-'))
const app = await electron.launch({
  cwd: frontend,
  args: ['.', `--user-data-dir=${userDataDir}`]
})
let failed = false
try {
  // Toda exceção não tratada do processo main fica registrada aqui (é ela que
  // vira o diálogo "A JavaScript error occurred in the main process").
  await app.evaluate(() => {
    globalThis.__mainErrors = []
    process.on('uncaughtException', (err) => globalThis.__mainErrors.push(String(err)))
  })
  const mainErrors = () => app.evaluate(() => globalThis.__mainErrors)

  const page = await app.firstWindow()
  page.on('console', (m) => { if (m.type() === 'error') console.log('console:', m.text()) })
  await page.waitForSelector('input[autocomplete=username]', { timeout: 30000 })
  await page.fill('input[autocomplete=username]', email)
  await page.fill('input[type=password]', password)
  await page.click('button[type=submit]')
  await page.getByText('Adicionar amigo').first().waitFor({ timeout: 30000 })
  await page.evaluate((id) => { location.hash = `#/servers/${id}` }, serverId)
  await page.getByText('voz-tela', { exact: true }).first().click()
  await page.getByRole('button', { name: 'Compartilhar tela' }).first().waitFor({ timeout: 20000 })

  const errorToast = () => page.getByText('Não foi possível compartilhar a tela').count()
  const picker = page.getByText('Compartilhe sua tela')

  for (const [how, close] of [
    ['botão Cancelar', () => page.getByRole('button', { name: 'Cancelar' }).click()],
    ['tecla Esc', () => page.keyboard.press('Escape')]
  ]) {
    await page.getByRole('button', { name: 'Compartilhar tela' }).first().click()
    await picker.waitFor({ timeout: 10000 })
    await close()
    await page.waitForTimeout(1500)
    check(`${how}: processo main sem exceção`, (await mainErrors()).length === 0, await mainErrors())
    check(`${how}: sem toast de erro`, (await errorToast()) === 0, 'sem toast')
    check(`${how}: continua sem compartilhar`,
      (await page.getByRole('button', { name: 'Parar de compartilhar tela' }).count()) === 0, 'ok')
  }

  // Cancelar não pode deixar o seletor travado: compartilhar logo em seguida.
  await page.getByRole('button', { name: 'Compartilhar tela' }).first().click()
  await picker.waitFor({ timeout: 10000 })
  await page.locator('button:has(img)').first().click()
  await page.getByRole('button', { name: 'Compartilhar', exact: true }).click()
  await page.getByRole('button', { name: 'Parar de compartilhar tela' }).first().waitFor({ timeout: 15000 })
  check('depois de cancelar, compartilhar funciona', true, 'compartilhando')
  await page.getByRole('button', { name: 'Parar de compartilhar tela' }).first().click()
  check('processo main sem exceção no fim', (await mainErrors()).length === 0, await mainErrors())
  await page.getByRole('button', { name: 'Desconectar', exact: true }).click()
} catch (err) {
  failed = true
  console.error(err.message)
} finally {
  await app.close().catch(() => {})
}
process.exit(failed ? 1 : 0)
