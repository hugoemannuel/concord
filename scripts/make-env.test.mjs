if (process.platform === 'win32') process.exit(0);
// Testa scripts/make-env.sh: o .env de um servidor novo (VPS ou PC com playit)
// com segredos fortes que nunca aparecem na saída, e o --set que troca uma
// linha sem estragar o arquivo.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

const SCRIPT = new URL('./make-env.sh', import.meta.url).pathname
const EXAMPLE = new URL('../backend/.env.example', import.meta.url).pathname

function run(args, input) {
  const r = spawnSync('bash', input === undefined ? [SCRIPT, ...args] : ['-s', '--', ...args], {
    encoding: 'utf8',
    input
  })
  return { code: r.status, out: r.stdout + r.stderr }
}

function tmpFile() {
  return join(mkdtempSync(join(tmpdir(), 'make-env-')), '.env')
}

/** Lê o .env como o godotenv lê as linhas simples (NOME=valor ou NOME='valor'). */
function parse(file) {
  const env = {}
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line)
    if (m) env[m[1]] = m[2].replace(/^'(.*)'$/, '$1')
  }
  return env
}

test('--vps: backend atrás do Caddy, LIVEKIT_NODE_IP vazio e segredos fortes que não aparecem', () => {
  const file = tmpFile()
  const r = run(['--vps', 'https://1-2-3-4.sslip.io/', file])
  assert.equal(r.code, 0, r.out)
  const env = parse(file)
  assert.equal(env.HOST, '127.0.0.1')
  assert.equal(env.PORT, '8090')
  assert.equal(env.LIVEKIT_NODE_IP, '')
  assert.equal(env.LIVEKIT_TCP_PORT, '7881')
  assert.equal(env.LIVEKIT_UDP_PORT, '7882')
  assert.equal(env.PUBLIC_URL, 'https://1-2-3-4.sslip.io')
  assert.equal(env.APP_URL, 'https://1-2-3-4.sslip.io')
  assert.match(env.JWT_SECRET, /^[0-9a-f]{64}$/)
  assert.match(env.LIVEKIT_API_SECRET, /^[0-9a-f]{64}$/)
  assert.notEqual(env.JWT_SECRET, env.LIVEKIT_API_SECRET)
  assert.ok(!r.out.includes(env.JWT_SECRET), 'JWT_SECRET apareceu na saída')
  assert.ok(!r.out.includes(env.LIVEKIT_API_SECRET), 'LIVEKIT_API_SECRET apareceu na saída')
  assert.equal(statSync(file).mode & 0o777, 0o600)
})

test('--pc: escuta em todas as interfaces e lembra do playit', () => {
  const file = tmpFile()
  const r = run(['--pc', 'http://abc.gl.at.ply.gg:12345', file])
  assert.equal(r.code, 0, r.out)
  const env = parse(file)
  assert.equal(env.HOST, '')
  assert.equal(env.PORT, '8080')
  assert.equal(env.PUBLIC_URL, 'http://abc.gl.at.ply.gg:12345')
  assert.match(r.out, /playit-ip\.sh/)
})

test('toda variável gerada existe no backend/.env.example (não inventa nome)', () => {
  const file = tmpFile()
  run(['--vps', 'https://x.sslip.io', file])
  const example = readFileSync(EXAMPLE, 'utf8')
  for (const name of Object.keys(parse(file))) {
    assert.match(example, new RegExp(`^#? ?${name}=`, 'm'), `${name} não está no .env.example`)
  }
})

test('não sobrescreve um .env que já existe (todo mundo perderia o login)', () => {
  const file = tmpFile()
  writeFileSync(file, 'JWT_SECRET=antigo\n')
  const r = run(['--vps', 'https://x.sslip.io', file])
  assert.notEqual(r.code, 0)
  assert.match(r.out, /já existe/)
  assert.equal(readFileSync(file, 'utf8'), 'JWT_SECRET=antigo\n')
})

test('recusa endereço que não começa com http(s)://', () => {
  const file = tmpFile()
  const r = run(['--vps', '1.2.3.4', file])
  assert.notEqual(r.code, 0)
  assert.ok(!existsSync(file))
})

test('funciona mandado pelo ssh (bash -s), sem o resto do repositório', () => {
  const file = tmpFile()
  const r = run(['--vps', 'https://x.sslip.io', file], readFileSync(SCRIPT, 'utf8'))
  assert.equal(r.code, 0, r.out)
  assert.equal(parse(file).HOST, '127.0.0.1')
})

test('--set troca a linha, acrescenta a que falta e não mostra o valor', () => {
  const file = tmpFile()
  run(['--vps', 'https://x.sslip.io', file])
  const before = parse(file)
  assert.equal(run(['--set', 'SMTP_HOST=smtp-relay.brevo.com', file]).code, 0)
  const r = run(['--set', 'SMTP_PASS=s3nh@ #com espaço/e&barra', file])
  assert.equal(r.code, 0, r.out)
  assert.ok(!r.out.includes('s3nh@'), 'o valor apareceu na saída')
  assert.equal(run(['--set', 'GIPHY_API_KEY=abc123', file]).code, 0)
  const env = parse(file)
  assert.equal(env.SMTP_HOST, 'smtp-relay.brevo.com')
  assert.equal(env.SMTP_PASS, 's3nh@ #com espaço/e&barra')
  assert.equal(env.GIPHY_API_KEY, 'abc123')
  assert.equal(env.JWT_SECRET, before.JWT_SECRET)
  assert.equal(readFileSync(file, 'utf8').match(/^SMTP_HOST=/gm).length, 1)
  assert.equal(statSync(file).mode & 0o777, 0o600)
})

test('--set recusa nome inválido e valor com aspas simples ou quebra de linha', () => {
  const file = tmpFile()
  run(['--vps', 'https://x.sslip.io', file])
  const before = readFileSync(file, 'utf8')
  assert.notEqual(run(['--set', 'nome-ruim=1', file]).code, 0)
  assert.notEqual(run(['--set', "SMTP_PASS=a'b", file]).code, 0)
  assert.notEqual(run(['--set', 'SMTP_PASS=a\nJWT_SECRET=x', file]).code, 0)
  assert.equal(readFileSync(file, 'utf8'), before)
})
