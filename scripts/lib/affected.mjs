// Mapeia arquivos alterados (caminhos relativos à raiz do repo) para o que
// precisa ser testado. Só funções puras: quem roda os comandos é o CLI.
import { existsSync } from 'node:fs'
import path from 'node:path'

// Código usado por quase todo o resto: mexeu aqui, roda a suíte inteira.
export const SHARED = [
  'backend/cmd/',
  'backend/go.mod',
  'backend/internal/platform/',
  'backend/internal/permission/',
  'frontend/package.json',
  'frontend/src/renderer/src/shared/',
  'frontend/src/preload/'
]

const isGo = (f) => f.startsWith('backend/') && f.endsWith('.go')
const isTs = (f) => f.startsWith('frontend/src/') && /\.(ts|tsx)$/.test(f)
// Código usado por todo o mobile: mexeu aqui, roda a suíte inteira do mobile.
export const MOBILE_SHARED = ['mobile/package.json', 'mobile/src/shared/']

const isMobile = (f) => /^mobile\/(src|app)\/.*\.(ts|tsx)$/.test(f)
const isScript = (f) => (f.startsWith('scripts/') && f.endsWith('.mjs')) || (f.startsWith('site/') && /\.m?js$/.test(f))
// O DSP em Rust e o .wasm gerado dele: o scripts/dsp-wasm.test.mjs confere que andam juntos.
const isDsp = (f) => f.startsWith('native/concord-dsp/') || f.startsWith('frontend/src/renderer/src/features/call/lib/concordDsp.wasm')
const DSP_CHECK = 'scripts/dsp-wasm.mjs'

export function classify(files) {
  const scripts = files.filter(isScript)
  if (files.some(isDsp) && !scripts.includes(DSP_CHECK)) scripts.push(DSP_CHECK)
  return {
    go: files.filter(isGo),
    ts: files.filter(isTs),
    mobile: files.filter(isMobile),
    scripts,
    shared: files.some((f) => SHARED.some((prefix) => f.startsWith(prefix))),
    mobileShared: files.some((f) => MOBILE_SHARED.some((prefix) => f.startsWith(prefix)))
  }
}

// goPackages: pacotes (relativos a backend/, no formato ./x/y) dos arquivos Go.
export const goPackages = (goFiles) =>
  [...new Set(goFiles.map((f) => './' + path.posix.dirname(f.slice('backend/'.length))))].sort()

// parseGoList lê `go list -f '{{.ImportPath}}|{{join .Imports ","}}|...'`
// e devolve { pacote: [pacotes que ele importa, inclusive nos testes] }.
export function parseGoList(text) {
  const graph = {}
  for (const line of text.split('\n').filter(Boolean)) {
    const [pkg, ...lists] = line.trim().split('|')
    graph[pkg] = lists.flatMap((list) => list.split(',')).filter(Boolean)
  }
  return graph
}

// dependents: os pacotes alterados + todos que dependem deles (fecho reverso).
export function dependents(graph, changed) {
  const result = new Set(changed)
  let grew = true
  while (grew) {
    grew = false
    for (const [pkg, imports] of Object.entries(graph)) {
      if (!result.has(pkg) && imports.some((dep) => result.has(dep))) {
        result.add(pkg)
        grew = true
      }
    }
  }
  return [...result].sort()
}

// scriptTests: x.mjs/x.js → x.test.mjs ao lado (se existir); testes alterados entram direto.
export function scriptTests(scriptFiles, exists = existsSync) {
  const tests = scriptFiles.map((f) => (f.endsWith('.test.mjs') ? f : f.replace(/\.m?js$/, '.test.mjs')))
  return [...new Set(tests.filter((f) => exists(f)))].sort()
}

const MODES = ['loop', 'pr', 'full']

// parseArgs: modo (loop|pr|full) e --base <ref> da linha de comando. Erro em
// vez de cair calado no loop, que pula vet/CRAP e ainda diz "Tudo verde".
export function parseArgs(args) {
  const i = args.indexOf('--base')
  const base = i >= 0 ? args[i + 1] : null
  if (i >= 0 && (!base || base.startsWith('--'))) throw new Error('--base sem valor')
  const mode = args.find((a, j) => !a.startsWith('--') && (i < 0 || j !== i + 1)) ?? 'loop'
  if (!MODES.includes(mode)) throw new Error(`modo desconhecido: ${mode} (use ${MODES.join('|')})`)
  return { mode, base }
}
