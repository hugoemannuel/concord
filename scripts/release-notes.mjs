// Gera o título e o corpo do PR de release (develop → main) a partir dos PRs
// mergeados na develop desde a última release (docs/ai/release-e-hotfix.md).
//
//   node scripts/release-notes.mjs            # imprime título e corpo
//   node scripts/release-notes.mjs --create   # mostra, pergunta [s/N] e abre o PR com o gh
//
// Os `closes #N` vêm do texto dos PRs: o GitHub só liga issues a PRs que entram
// na branch padrão, então o `closingIssuesReferences` vem vazio na develop.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'

const TEMPLATE = new URL('../.github/PULL_REQUEST_TEMPLATE/release.md', import.meta.url)
const MERGE = /^Merge pull request #(\d+) /
const TYPED = /^(\w+)(?:\([^)]*\))?!?: (.+)$/
const CLOSES = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/gi
const LISTED = new Set(['feat', 'fix', 'perf'])
const MAX_TITLE = 100

/** Números dos PRs nos assuntos dos merges, na ordem. */
export function parseMergedPrs(subjects) {
  return subjects
    .map((s) => MERGE.exec(s)?.[1])
    .filter(Boolean)
    .map(Number)
}

/** Issues que o texto fecha ("closes #1", "fixes #2"), sem repetir, em ordem. */
export function extractCloses(text) {
  const numbers = [...text.matchAll(CLOSES)].map((m) => Number(m[1]))
  return [...new Set(numbers)].sort((a, b) => a - b)
}

function classify(pr) {
  const m = TYPED.exec(pr.title)
  return m ? { ...pr, type: m[1], summary: m[2] } : { ...pr, type: 'other', summary: pr.title }
}

const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1)

function item(pr) {
  const closes = extractCloses(`${pr.title}\n${pr.body}`)
  const suffix = closes.length > 0 ? ` — closes ${closes.map((n) => `#${n}`).join(', ')}` : ''
  return `- ${capitalize(pr.summary)} ([${pr.title} #${pr.number}](${pr.url}))${suffix}`
}

function joinList(items) {
  if (items.length < 2) return items.join('')
  return `${items.slice(0, -1).join(', ')} e ${items.at(-1)}`
}

/** "release: a, b e c"; se passar do limite, mantém os primeiros e diz "e mais N". */
function fitTitle([first, ...others]) {
  const summaries = [capitalize(first), ...others]
  const candidate = (n) => {
    const rest = summaries.length - n
    const text = rest === 0 ? joinList(summaries) : `${summaries.slice(0, n).join(', ')} e mais ${rest}`
    return `release: ${text}`
  }
  for (let n = summaries.length; n > 1; n--) {
    if (candidate(n).length <= MAX_TITLE) return candidate(n)
  }
  return candidate(1).slice(0, MAX_TITLE)
}

function releaseTitle(prs) {
  const feats = prs.filter((p) => p.type === 'feat')
  const pool = feats.length > 0 ? feats : prs.filter((p) => p.type === 'fix' || p.type === 'perf')
  return pool.length === 0 ? 'release: manutenção' : fitTitle(pool.map((p) => p.summary))
}

/** A seção "Como testar" do template de release, que é a fonte única do checklist. */
function testSection(template) {
  const text = template.replace(/\r\n/g, '\n')
  const start = text.indexOf('## Como testar')
  if (start === -1) throw new Error('o template de release não tem a seção "## Como testar"')
  return `${text.slice(start).trimEnd()}\n`
}

/** `prs`: [{ number, title, body, url }] na ordem do merge. Devolve { title, body }. */
export function buildRelease(prs, template) {
  const all = prs.map(classify)
  const listed = all.filter((p) => LISTED.has(p.type))
  const maintenance = all.filter((p) => !LISTED.has(p.type))
  const maintenanceLine =
    maintenance.length > 0 ? `Manutenção: ${maintenance.map((p) => `#${p.number}`).join(', ')}` : ''
  const changes = [listed.map(item).join('\n'), maintenanceLine].filter(Boolean).join('\n\n')
  return {
    title: releaseTitle(all),
    body: `## O que muda\n\n${changes}\n\n${testSection(template)}`
  }
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' })
}

function repoOfOrigin() {
  const url = git(['remote', 'get-url', 'origin']).trim()
  const match = /github\.com[:/](.+?)(?:\.git)?$/.exec(url)
  if (!match) throw new Error(`não entendi o remote origin: ${url}`)
  return match[1]
}

function loadPr(number, repo) {
  const json = execFileSync('gh', ['pr', 'view', String(number), '--repo', repo, '--json', 'number,title,body,url'], {
    encoding: 'utf8'
  })
  return JSON.parse(json)
}

async function confirm(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = await rl.question(question)
  rl.close()
  return /^s(im)?$/i.test(answer.trim())
}

async function main(create) {
  git(['fetch', 'origin', '--quiet'])
  const repo = repoOfOrigin()
  const subjects = git(['log', '--first-parent', '--format=%s', 'origin/main..origin/develop']).split('\n')
  const numbers = parseMergedPrs(subjects).reverse()
  if (numbers.length === 0) {
    console.error('nenhum PR novo na develop desde a main')
    process.exit(1)
  }
  const { title, body } = buildRelease(
    numbers.map((n) => loadPr(n, repo)),
    readFileSync(TEMPLATE, 'utf8')
  )
  console.log(`${title}\n\n${body}`)
  if (create && (await confirm('Abrir o PR develop → main com este texto? [s/N] '))) {
    execFileSync('gh', ['pr', 'create', '--repo', repo, '--base', 'main', '--head', 'develop', '--title', title, '--body', body], {
      stdio: 'inherit'
    })
  }
}

if (process.argv[1]?.endsWith('release-notes.mjs')) {
  await main(process.argv.includes('--create'))
}
