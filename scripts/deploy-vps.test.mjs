if (process.platform === 'win32') process.exit(0);
// Testa scripts/deploy-vps.sh de ponta a ponta com comandos falsos: o ssh junta
// os argumentos num texto só como o OpenSSH (argumento vazio some) e roda o
// "servidor" numa pasta temporária; go, rsync, docker, systemctl, curl e
// journalctl são de mentira. Não precisa de rede, Docker nem VPS.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

const SCRIPT = new URL('./deploy-vps.sh', import.meta.url).pathname
const CAPABILITY = 'concord-capability:socket-activation-v1'

function stub(dir, name, body) {
  const path = join(dir, name)
  writeFileSync(path, `#!/usr/bin/env bash\n${body}\n`)
  chmodSync(path, 0o755)
}

/** Binário falso: KIND diz como ele se comporta no /healthz; a marca do socket é opcional. */
function fakeBinary(kind, { socket = true } = {}) {
  return [
    '#!/bin/sh',
    `# KIND=${kind}`,
    socket ? `# ${CAPABILITY}` : '# sem socket',
    '[ "$1" = migrate ] && { echo "migrate dir=$MIGRATIONS_DIR" >> "$LOG"; [ -n "$FAIL_MIGRATE" ] && exit 1; exit 0; }',
    'exit 0',
    ''
  ].join('\n')
}

function setup({ newKind = 'good', newSocket = true, socketActive = false, current = null, good = null } = {}) {
  const base = mkdtempSync(join(tmpdir(), 'deploy-test-'))
  const bin = join(base, 'bin')
  const server = join(base, 'opt-concord')
  mkdirSync(bin)
  mkdirSync(join(server, 'migrations'), { recursive: true })
  writeFileSync(join(server, 'migrations', 'ANTIGA'), '')
  writeFileSync(join(server, '.env'), 'export PORT="8090" # backend\n')
  if (current) writeFileSync(join(server, 'concord-server'), current)
  if (good) writeFileSync(join(server, 'concord-server.good'), good)
  const log = join(base, 'log')
  writeFileSync(log, '')
  writeFileSync(join(base, 'new-binary'), fakeBinary(newKind, { socket: newSocket }))

  // OpenSSH: ssh host cmd... vira um texto só, rodado pelo shell remoto.
  stub(bin, 'ssh', 'shift; echo "ssh: $*" >> "$LOG"; exec bash -c "$*"')
  stub(bin, 'rsync', `
args=(); for a in "$@"; do args+=("\${a#*:}"); done   # host:caminho -> caminho
src="\${args[\${#args[@]}-2]}"
[ -e "$src" ] || exit 0
exec /usr/bin/rsync "\${args[@]}"`)
  stub(bin, 'go', `
while [ $# -gt 0 ]; do [ "$1" = -o ] && { cp "${join(base, 'new-binary')}" "$2"; exit 0; }; shift; done`)
  stub(bin, 'docker', 'exit 0')
  stub(bin, 'ffmpeg', 'exit 0') // dependências do Maestro já presentes: o deploy não instala nada
  stub(bin, 'yt-dlp', 'exit 0')
  stub(bin, 'journalctl', 'echo "(journal)"')
  stub(bin, 'systemctl', `
echo "systemctl $*" >> "$LOG"
case "$1" in
  is-active) [ "$SOCKET_ACTIVE" = 1 ] && [ "$3" = concord-server.socket ] && exit 0; exit 3 ;;
  is-enabled) [ "$SOCKET_ENABLED" = 1 ] && [ "$3" = concord-server.socket ] && exit 0; exit 1 ;;
  show) echo "127.0.0.1:8090 (Stream)" ;;
  restart) sed -n 's/^# KIND=//p' "${server}/concord-server" > "${server}/running" ;;
esac
exit 0`)
  stub(bin, 'curl', `
url="\${@: -1}"
kind=$(cat "${server}/running" 2>/dev/null)
case "$kind" in
  good) code=200 ;;
  sem-healthz) code=404 ;;
  # Com o socket a conexão nunca é recusada: o curl espera o -m inteiro.
  *) m=1; prev=""; for a in "$@"; do [ "$prev" = -m ] && m="$a"; prev="$a"; done; sleep "$m"; code=000 ;;
esac
for a in "$@"; do [ "$a" = '%{http_code}' ] && { printf %s "$code"; exit 0; }; done
[ "$code" = 200 ]`)

  return { base, server, log, env: { PATH: `${bin}:${process.env.PATH}`, LOG: log, SOCKET_ACTIVE: socketActive ? '1' : '0' } }
}

function deploy(ctx, args = ['root@vps'], extraEnv = {}) {
  const env = { ...process.env, ...ctx.env, CONCORD_REMOTE_DIR: ctx.server, CONCORD_SYSTEMD_DIR: join(ctx.base, 'systemd'), HEALTH_TIMEOUT: '2', ...extraEnv }
  delete env.GITHUB_ACTIONS // como no PC: o problema era o argumento vazio
  const begin = Date.now()
  const r = spawnSync('bash', [SCRIPT, ...args], { env, encoding: 'utf8' })
  return { ...r, ms: Date.now() - begin, log: readFileSync(ctx.log, 'utf8') }
}

const read = (ctx, name) => readFileSync(join(ctx.server, name), 'utf8')

test('deploy do PC (sem GITHUB_ACTIONS) funciona e aplica as migrations da pasta nova', () => {
  const ctx = setup({ current: fakeBinary('good') })
  const r = deploy(ctx)
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /backend no ar/)
  assert.match(r.log, /migrate dir=migrations\.new/)
  assert.ok(existsSync(join(ctx.server, 'concord-server.good')))
  assert.ok(!existsSync(join(ctx.server, 'migrations', 'ANTIGA')), 'migrations antigas não foram trocadas')
  assert.ok(existsSync(join(ctx.server, 'site')), 'página não publicada')
})

test('com o socket ativo, recusa binário sem suporte a ele sem trocar nada', () => {
  const old = fakeBinary('good')
  const ctx = setup({ socketActive: true, newSocket: false, current: old, good: old })
  const r = deploy(ctx)
  assert.equal(r.status, 1)
  assert.match(r.stderr, /socket está ativo/)
  assert.equal(read(ctx, 'concord-server'), old)
  assert.ok(existsSync(join(ctx.server, 'migrations', 'ANTIGA')))
  assert.doesNotMatch(r.log, /systemctl restart/)
  assert.doesNotMatch(r.log, /migrate/)
})

test('socket habilitado mas parado (manutenção) também recusa binário sem suporte a ele', () => {
  // O restart traria o socket de volta pelo Wants= e o binário não subiria.
  const old = fakeBinary('good')
  const ctx = setup({ newSocket: false, current: old, good: old })
  const r = deploy(ctx, ['root@vps'], { SOCKET_ENABLED: '1' })
  assert.equal(r.status, 1)
  assert.match(r.stderr, /socket está ativo \(ou habilitado\)/)
  assert.equal(read(ctx, 'concord-server'), old)
  assert.doesNotMatch(r.log, /systemctl restart/)
})

test('migration que falha não troca nada', () => {
  const old = fakeBinary('good')
  const ctx = setup({ current: old, good: old })
  const r = deploy(ctx, ['root@vps'], { FAIL_MIGRATE: '1' })
  assert.equal(r.status, 1)
  assert.match(r.stderr, /migrations falharam/)
  assert.equal(read(ctx, 'concord-server'), old)
  assert.ok(existsSync(join(ctx.server, 'migrations', 'ANTIGA')))
  assert.ok(!existsSync(join(ctx.server, 'site')))
  assert.doesNotMatch(r.log, /systemctl restart/)
})

test('binário novo que não fica saudável: volta para o anterior, no prazo', () => {
  const good = fakeBinary('good')
  const ctx = setup({ newKind: 'quebrado', socketActive: true, current: good, good })
  const r = deploy(ctx)
  assert.equal(r.status, 1)
  assert.match(r.stderr, /voltei para o binário anterior, que está no ar\. O novo/)
  assert.equal(read(ctx, 'concord-server'), good)
  assert.match(read(ctx, 'concord-server.failed'), /KIND=quebrado/)
  assert.ok(!existsSync(join(ctx.server, 'site')), 'publicou a página com o deploy falhando')
  // Prazo de 2 s (HEALTH_TIMEOUT) contado no relógio, não 60 tentativas de 2 s.
  assert.ok(r.ms < 15000, `demorou ${r.ms} ms`)
})

test('o prazo do /healthz é total: curl que espera o -m inteiro não estica a espera', () => {
  // 60 tentativas com -m 2 davam ~150 s; com HEALTH_TIMEOUT=4 o deploy inteiro
  // (espera do novo + volta ao anterior, que responde na hora) fica perto de 4 s.
  const good = fakeBinary('good')
  const ctx = setup({ newKind: 'quebrado', socketActive: true, current: good, good })
  const r = deploy(ctx, ['root@vps'], { HEALTH_TIMEOUT: '4' })
  assert.equal(r.status, 1)
  assert.match(r.stderr, /não respondeu \/healthz em 4 s/)
  assert.ok(r.ms < 9000, `demorou ${r.ms} ms`)
})

test('primeiro deploy que falha volta ao binário antigo, que não tem /healthz, e diz que ele está no ar', () => {
  const ctx = setup({ newKind: 'quebrado', current: fakeBinary('sem-healthz', { socket: false }) })
  const r = deploy(ctx, ['root@vps'], { HEALTH_TIMEOUT: '4' })
  assert.equal(r.status, 1)
  assert.match(r.stderr, /que está no ar \(é de antes do \/healthz\)/)
  assert.doesNotMatch(r.stderr, /também não respondeu/)
  // Uma espera só depois da volta: o 404 conta na hora (antes esperava o
  // prazo inteiro por um 200 que nunca vinha).
  assert.ok(r.ms < 9000, `demorou ${r.ms} ms`)
})

test('nem o anterior responde: diz isso, sem fingir que voltou', () => {
  const ctx = setup({ newKind: 'quebrado', current: fakeBinary('quebrado') })
  const r = deploy(ctx)
  assert.equal(r.status, 1)
  assert.match(r.stderr, /o binário anterior também não respondeu em 2 s/)
  assert.doesNotMatch(r.stderr, /voltei para o binário anterior/)
})

test('com o socket ativo, não volta para um binário anterior sem suporte a ele', () => {
  const ctx = setup({ newKind: 'quebrado', socketActive: true, current: fakeBinary('good', { socket: false }) })
  const r = deploy(ctx)
  assert.equal(r.status, 1)
  assert.match(r.stderr, /anterior não sabe usar o socket/)
  assert.equal(r.log.match(/systemctl restart/g)?.length, 1, 'reiniciou com o binário sem socket')
})

test('pasta remota com espaço e aspas chega inteira ao servidor', () => {
  const ctx = setup({ current: fakeBinary('good') })
  const odd = join(ctx.base, "opt concord's")
  spawnSync('cp', ['-r', ctx.server, odd])
  ctx.server = odd
  const r = deploy(ctx)
  assert.equal(r.status, 0, r.stderr)
  assert.ok(existsSync(join(odd, 'concord-server.good')))
})

test('source maps com mais de 90 dias saem da VPS; os recentes ficam', () => {
  const ctx = setup({ current: fakeBinary('good') })
  const maps = join(ctx.server, 'sourcemaps')
  mkdirSync(maps)
  writeFileSync(join(maps, 'index-velho.js.map'), '{}')
  writeFileSync(join(maps, 'index-novo.js.map'), '{}')
  const old = new Date(Date.now() - 100 * 86400_000)
  utimesSync(join(maps, 'index-velho.js.map'), old, old)
  const r = deploy(ctx)
  assert.equal(r.status, 0, r.stderr)
  assert.ok(!existsSync(join(maps, 'index-velho.js.map')), 'o de 100 dias ficou')
  assert.ok(existsSync(join(maps, 'index-novo.js.map')), 'o recente saiu')
})

test('--infra chega ao servidor', () => {
  const ctx = setup({ current: fakeBinary('good') })
  const r = deploy(ctx, ['--infra', 'root@vps'])
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.log, /INFRA=1/)
})

const IDS = '8afacbca-308c-4f59-9bc2-6f082cafdadd,326c9def-6fe5-4516-8b1d-98b48cd89d45'

test('TECH_TEAM_USER_IDS entra no .env da VPS sem apagar o resto', () => {
  const ctx = setup({ current: fakeBinary('good') })
  const r = deploy(ctx, ['root@vps'], { TECH_TEAM_USER_IDS: IDS })
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /TECH_TEAM_USER_IDS gravado/)
  assert.equal(read(ctx, '.env'), `export PORT="8090" # backend\nTECH_TEAM_USER_IDS=${IDS}\n`)
})

test('TECH_TEAM_USER_IDS troca a linha que já existe (e as repetidas)', () => {
  const ctx = setup({ current: fakeBinary('good') })
  writeFileSync(
    join(ctx.server, '.env'),
    'A=1\nTECH_TEAM_USER_IDS=velho\n# TECH_TEAM_USER_IDS=comentado\nexport TECH_TEAM_USER_IDS=outro\nB=2'
  )
  const r = deploy(ctx, ['root@vps'], { TECH_TEAM_USER_IDS: IDS })
  assert.equal(r.status, 0, r.stderr)
  assert.equal(
    read(ctx, '.env'),
    `A=1\nTECH_TEAM_USER_IDS=${IDS}\n# TECH_TEAM_USER_IDS=comentado\nB=2\n`
  )
})

test('CHANGELOG_TOKEN entra no .env da VPS sem apagar o resto', () => {
  const ctx = setup({ current: fakeBinary('good') })
  const r = deploy(ctx, ['root@vps'], { CHANGELOG_TOKEN: 'abc123DEF456' })
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /CHANGELOG_TOKEN gravado/)
  assert.equal(read(ctx, '.env'), 'export PORT="8090" # backend\nCHANGELOG_TOKEN=abc123DEF456\n')
})

test('sem TECH_TEAM_USER_IDS (vazio ou ausente) o .env fica intacto', () => {
  const ctx = setup({ current: fakeBinary('good') })
  const before = read(ctx, '.env')
  for (const extra of [{}, { TECH_TEAM_USER_IDS: '' }]) {
    const r = deploy(ctx, ['root@vps'], extra)
    assert.equal(r.status, 0, r.stderr)
    assert.equal(read(ctx, '.env'), before)
  }
})

test('valor com quebra de linha ou espaço é recusado antes de qualquer troca', () => {
  for (const bad of ['a\nEVIL=1', 'a b', 'a"b', 'a$(x)']) {
    const ctx = setup({ current: fakeBinary('good') })
    const before = read(ctx, '.env')
    const r = deploy(ctx, ['root@vps'], { TECH_TEAM_USER_IDS: bad })
    assert.equal(r.status, 1, JSON.stringify(bad))
    assert.match(r.stderr, /TECH_TEAM_USER_IDS tem caracteres/)
    assert.equal(read(ctx, '.env'), before)
    assert.ok(!existsSync(join(ctx.server, 'concord-server.good')), 'seguiu para o restart')
  }
})

// Alertas das unidades do systemd (docs/adr/0071).
const ALERT_UNIT = readFileSync(new URL('../deploy/concord-alerta@.service', import.meta.url), 'utf8')
const DROPIN = '# Gerado pelo scripts/deploy-vps.sh: falhou, avisa em #alertas (docs/adr/0071).\n[Unit]\nOnFailure=concord-alerta@%n.service\n'

function withUnits(ctx, units) {
  const dir = join(ctx.base, 'systemd')
  mkdirSync(dir, { recursive: true })
  for (const [name, body] of Object.entries(units)) writeFileSync(join(dir, name), body)
  return dir
}

test('instala o concord-alerta@.service e o OnFailure nas unidades concord-* e salinha-*', () => {
  const ctx = setup({ current: fakeBinary('good') })
  const dir = withUnits(ctx, {
    'concord-backup.service': '[Unit]\nDescription=backup\n',
    'salinha-firewall.service': '[Unit]\nDescription=firewall\n',
    'concord-server.service': '[Unit]\nDescription=backend\n',
    'concord-ja-tem.service': '[Unit]\nOnFailure=concord-alerta@%n.service\n',
    'outra.service': '[Unit]\n'
  })
  const r = deploy(ctx)
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /Alertas: OnFailure das unidades do systemd em dia/)
  assert.equal(readFileSync(join(dir, 'concord-alerta@.service'), 'utf8'), ALERT_UNIT)
  for (const unit of ['concord-backup.service', 'salinha-firewall.service']) {
    assert.equal(readFileSync(join(dir, `${unit}.d`, 'alerta.conf'), 'utf8'), DROPIN, unit)
  }
  for (const unit of ['concord-server.service', 'concord-ja-tem.service', 'outra.service', 'concord-alerta@.service']) {
    assert.ok(!existsSync(join(dir, `${unit}.d`, 'alerta.conf')), `${unit} ganhou o complemento`)
  }
  // O que o deploy gera já nasce com o OnFailure.
  assert.match(readFileSync(join(dir, 'concord-ytdlp-update.service'), 'utf8'), /^OnFailure=concord-alerta@%n\.service$/m)
  assert.match(r.log, /systemctl daemon-reload/)
})

test('deploy de novo sem mudança não recarrega o systemd', () => {
  const ctx = setup({ current: fakeBinary('good') })
  withUnits(ctx, { 'concord-backup.service': '[Unit]\n' })
  assert.equal(deploy(ctx).status, 0)
  writeFileSync(ctx.log, '')
  const r = deploy(ctx)
  assert.equal(r.status, 0, r.stderr)
  assert.doesNotMatch(r.log, /daemon-reload/)
})
