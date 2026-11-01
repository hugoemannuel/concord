if (process.platform === 'win32') process.exit(0);
// Testa scripts/self-update.sh (servidor próprio, docs/ai/servidor-proprio.md):
// git, yarn e o deploy são de mentira; confere a ordem, o endereço do app web
// tirado do .env e que um passo que falha para tudo.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

const SCRIPT = new URL('./self-update.sh', import.meta.url).pathname

function setup({ failGit = false } = {}) {
  const base = mkdtempSync(join(tmpdir(), 'self-update-'))
  const bin = join(base, 'bin')
  mkdirSync(bin)
  const log = join(base, 'log')
  writeFileSync(log, '')
  const env = join(base, '.env')
  writeFileSync(env, "HOST=127.0.0.1\nPUBLIC_URL=https://1-2-3-4.sslip.io/\nJWT_SECRET='x'\n")
  const stub = (name, body) => {
    writeFileSync(join(bin, name), `#!/usr/bin/env bash\n${body}\n`)
    chmodSync(join(bin, name), 0o755)
  }
  stub('git', `echo "git $*" >> "${log}"; ${failGit ? 'exit 1' : 'exit 0'}`)
  stub('yarn', `echo "yarn $* WEB_PUBLIC_URL=\${WEB_PUBLIC_URL:-} pwd=$(basename "$PWD")" >> "${log}"`)
  stub('deploy', `echo "deploy $*" >> "${log}"`)
  const r = spawnSync('bash', [SCRIPT], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, CONCORD_ENV: env, DEPLOY_SCRIPT: join(bin, 'deploy') }
  })
  return { code: r.status, out: r.stdout + r.stderr, log: readFileSync(log, 'utf8').trim().split('\n') }
}

test('baixa o código, gera o app web com o PUBLIC_URL e faz o deploy local, nessa ordem', () => {
  const r = setup()
  assert.equal(r.code, 0, r.out)
  assert.deepEqual(r.log, [
    'git pull --ff-only',
    'yarn install --frozen-lockfile --ignore-scripts WEB_PUBLIC_URL=https://1-2-3-4.sslip.io pwd=frontend',
    'yarn build:web WEB_PUBLIC_URL=https://1-2-3-4.sslip.io pwd=frontend',
    'deploy root@localhost'
  ])
})

test('se o git falhar, não gera nem publica nada', () => {
  const r = setup({ failGit: true })
  assert.notEqual(r.code, 0)
  assert.deepEqual(r.log, ['git pull --ff-only'])
})
