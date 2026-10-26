// E2E do build genérico (instalador do GitHub Releases): tela inicial,
// "Hospedar um servidor" numa VPS de verdade pelo SSH (Postgres, LiveKit,
// backend e Caddy com HTTPS) e "Entrar num servidor" num segundo perfil,
// conferindo a CSP montada em tempo de execução.
//
// A "VPS" pode ser um contêiner Debian 12 com SSH (root/senha) e as portas
// 80, 443, 7881 e 7882/udp publicadas; os pacotes vêm de um "releases" local
// (scripts/package-server.sh com RELEASES_URL) e o salinha-host do deploy é
// compilado com a mesma chave de teste:
//
//   cd frontend && npx electron-vite build      (sem VITE_SERVER_URL)
//   HOST_BIN=<salinha-host do deploy> VPS=127.0.0.1:2222 VPS_PASSWORD=<senha> \
//   VPS_PUBLIC_IP=127.0.0.1 VPS_TLS_INTERNAL=1 [APP_VERSION=x.y.z] node scripts/e2e-instalador.mjs
//
// APP_VERSION: versão do pacote publicado (padrão: a do frontend/package.json).
//
// VPS_PUBLIC_IP e VPS_TLS_INTERNAL só para a VPS falsa (sslip.io do 127.0.0.1
// com o certificado interno do Caddy). Perfis temporários; não mexe na
// Salinha instalada.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const frontend = resolve(import.meta.dirname, '../frontend')
const require = createRequire(join(frontend, 'package.json'))
const { _electron: electron } = require('playwright')

const { HOST_BIN, VPS, VPS_PASSWORD, VPS_PUBLIC_IP, VPS_TLS_INTERNAL } = process.env
assert(HOST_BIN && existsSync(HOST_BIN), 'defina HOST_BIN com o salinha-host do deploy')
assert(VPS && VPS_PASSWORD, 'defina VPS (ip[:porta]) e VPS_PASSWORD')
assert(existsSync(join(frontend, 'out/main/index.js')), 'rode antes: cd frontend && npx electron-vite build')
assert(
  readFileSync(join(frontend, 'out/renderer/index.html'), 'utf8').includes('%CONCORD_CONNECT_SRC%'),
  'o build precisa ser o genérico (sem VITE_SERVER_URL)'
)
const insecure = VPS_TLS_INTERNAL === '1'
// Versão do pacote do servidor publicado (a do app; sem empacotar o Electron não sabe).
const APP_VERSION =
  process.env.APP_VERSION ?? JSON.parse(readFileSync(join(frontend, 'package.json'), 'utf8')).version

const work = mkdtempSync(join(tmpdir(), 'salinha-instalador-e2e-'))
// Perfil isolado (não briga com uma Salinha aberta) e sem reabrir de verdade:
// o relaunch só anota (a reabertura é o próximo launch do teste).
const bootstrap = join(work, 'bootstrap.cjs')
writeFileSync(
  bootstrap,
  `
const { createRequire } = require('node:module')
const requireApp = createRequire(${JSON.stringify(join(frontend, 'package.json'))})
const { app } = require('electron')
const fs = require('node:fs')
app.setPath('appData', process.env.E2E_PROFILE)
// Sem empacotar, o Electron devolve a versão dele: a do pacote publicado vale.
app.getVersion = () => ${JSON.stringify(APP_VERSION)}
${insecure ? "app.commandLine.appendSwitch('ignore-certificate-errors')" : ''}
app.relaunch = () => fs.writeFileSync(process.env.E2E_PROFILE + '/relaunched', '1')
requireApp(${JSON.stringify(join(frontend, 'out/main/index.js'))})
`
)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function launch(profile) {
  mkdirSync(profile, { recursive: true })
  const app = await electron.launch({
    args: [bootstrap],
    cwd: frontend,
    env: {
      ...process.env,
      E2E_PROFILE: profile,
      SALINHA_HOST_BIN: HOST_BIN,
      ...(VPS_PUBLIC_IP ? { SALINHA_DEPLOY_PUBLIC_IP: VPS_PUBLIC_IP } : {}),
      ...(insecure ? { SALINHA_DEPLOY_TLS_INTERNAL: '1' } : {})
    }
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  return { app, page }
}

async function waitRelaunch(app, profile) {
  for (let i = 0; i < 100 && !existsSync(join(profile, 'relaunched')); i++) await sleep(100)
  assert(existsSync(join(profile, 'relaunched')), 'o app não pediu para reabrir')
  await app.close().catch(() => {})
}

/** Fetch do renderer: passa pela CSP da página (connect-src). */
async function rendererFetch(page, url) {
  return page.evaluate(async (target) => {
    try {
      const res = await fetch(target)
      return `status ${res.status}`
    } catch (err) {
      return `bloqueado: ${err}`
    }
  }, url)
}

// ── 1. Hospedar ────────────────────────────────────────────────────────────
const hostProfile = join(work, 'perfil-host')
let { app, page } = await launch(hostProfile)
await page.getByText('Boas-vindas à Salinha!').waitFor()
await page.getByText('Hospedar um servidor').click()
await page.getByLabel('IP da VPS').fill(VPS)
await page.getByLabel('Senha', { exact: true }).fill('senha-errada')
await page.getByRole('button', { name: 'Instalar na VPS' }).click()
await page.getByText('usuário, senha ou chave recusados').waitFor({ timeout: 60_000 })
console.log('✓ senha errada: mensagem clara e volta para o formulário')

await page.getByLabel('Senha', { exact: true }).fill(VPS_PASSWORD)
await page.getByRole('button', { name: 'Instalar na VPS' }).click()
await page.getByText('Servidor no ar!').waitFor({ timeout: 600_000 })
const publicUrl = (await page.locator('code').first().textContent())?.trim()
assert.match(publicUrl, /^https:\/\//, `endereço para os amigos: ${publicUrl}`)
console.log(`✓ servidor instalado na VPS: ${publicUrl}`)

await page.getByRole('button', { name: 'Entrar no meu servidor' }).click()
await waitRelaunch(app, hostProfile)
const saved = JSON.parse(readFileSync(join(hostProfile, 'Concord', 'server.json'), 'utf8'))
assert.equal(saved.url, publicUrl)

;({ app, page } = await launch(hostProfile))
await page.getByText('Boas-vindas de volta!').waitFor()
assert.equal(await page.evaluate(() => window.api.server.url), publicUrl)
assert.equal(await rendererFetch(page, `${publicUrl}/healthz`), 'status 200')
assert.match(await rendererFetch(page, 'https://example.com/'), /^bloqueado/)
console.log('✓ app de quem hospeda entra no servidor; CSP libera só ele')
await app.close()

// ── 2. Entrar num servidor (outro perfil = outro computador) ─────────────────
const friendProfile = join(work, 'perfil-amigo')
;({ app, page } = await launch(friendProfile))
await page.getByText('Entrar num servidor').first().click()
await page.getByLabel('Endereço do servidor').fill(publicUrl)
await page.getByRole('button', { name: 'Conectar' }).click()
await waitRelaunch(app, friendProfile)
;({ app, page } = await launch(friendProfile))
await page.getByText('Boas-vindas de volta!').waitFor()
assert.equal(await rendererFetch(page, `${publicUrl}/healthz`), 'status 200')
console.log(`✓ amigo conectado em ${publicUrl}`)
await app.close()

console.log('\nE2E do instalador: tudo certo.')
console.log(`(perfis do teste em ${work})`)
