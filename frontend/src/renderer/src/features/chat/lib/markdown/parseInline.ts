import { ESCAPABLE, findRun, runLength } from './backticks'
import type { MdInline, MdStyle } from './types'

// Trechos de uma linha (regras do Discord): **negrito**, *itálico*/_itálico_,
// __sublinhado__, ~~riscado~~, ||spoiler||, `código` e \escape. Roda para todo
// mundo da sala, com texto de qualquer membro: cada delimitador que não fecha
// é lembrado (não procura de novo) e o aninhamento tem limite.

/** Mais fundo que isso, o resto do trecho fica texto. */
const MAX_DEPTH = 8

const WORD = /[\p{L}\p{N}]/u
const SPACE = /\s/
const URL_START = /https?:\/\/|www\./iy
const URL_STOP = /[\s<]/
const AUTOLINK = /<(https?:\/\/[^\s<>]+)>/y

const isSpace = (c: string | undefined): boolean => c === undefined || SPACE.test(c)
const isWord = (c: string | undefined): boolean => c !== undefined && WORD.test(c)

interface Delim {
  mark: string
  style: MdStyle
  /** O marcador em i pode abrir? (sem regra: sempre) */
  open?: (s: string, i: number) => boolean
  /** O marcador em j pode fechar? (sem regra: sempre) */
  close?: (s: string, j: number) => boolean
}

/** Ordem importa: o duplo antes do simples (`**` antes de `*`). */
const DELIMS: Delim[] = [
  { mark: '||', style: 'spoiler' },
  { mark: '**', style: 'bold', close: (s, j) => s[j + 2] !== '*' },
  { mark: '__', style: 'underline', close: (s, j) => s[j + 2] !== '_' },
  { mark: '~~', style: 'strike' },
  { mark: '*', style: 'italic', open: (s, i) => !isSpace(s[i + 1]), close: (s, j) => !isSpace(s[j - 1]) },
  {
    // `_` só com borda de palavra: snake_case_nome fica como está.
    mark: '_',
    style: 'italic',
    open: (s, i) => !isWord(s[i - 1]) && !isSpace(s[i + 1]),
    close: (s, j) => !isSpace(s[j - 1]) && !isWord(s[j + 1])
  }
]

/** Junta o texto solto num nó só; os outros nós entram na ordem. */
class Builder {
  readonly nodes: MdInline[] = []
  private buf = ''

  text(t: string): void {
    this.buf += t
  }

  node(n: MdInline): void {
    this.flush()
    this.nodes.push(n)
  }

  done(): MdInline[] {
    this.flush()
    return this.nodes
  }

  private flush(): void {
    if (!this.buf) return
    this.nodes.push({ type: 'text', text: this.buf })
    this.buf = ''
  }
}

interface Ctx {
  s: string
  out: Builder
  depth: number
  /** Delimitador → menor início de busca que já falhou (dali para frente também falha). */
  failed: Map<string, number>
}

/** Busca o fechamento uma vez por delimitador: depois de falhar, não procura mais à frente. */
function searchOnce(c: Ctx, key: string, start: number, find: () => number): number {
  const failedAt = c.failed.get(key)
  if (failedAt !== undefined && start >= failedAt) return -1
  const found = find()
  if (found < 0) c.failed.set(key, start)
  return found
}

/** Fechamento do delimitador: pula escapes e, no simples, o par duplo (`**` dentro de `*…*`). */
function findClose(s: string, d: Delim, start: number): number {
  const single = d.mark.length === 1
  for (let j = start; j < s.length; j++) {
    if (s[j] === '\\') {
      j++
      continue
    }
    if (!s.startsWith(d.mark, j)) continue
    if (single && s[j + 1] === d.mark) {
      j++
      continue
    }
    if (!d.close || d.close(s, j)) return j
  }
  return -1
}

type Rule = (c: Ctx, i: number) => number | null

const tryEscape: Rule = (c, i) => {
  const next = c.s[i + 1]
  if (c.s[i] !== '\\' || next === undefined || !ESCAPABLE.test(next)) return null
  c.out.text(next)
  return i + 2
}

const tryCode: Rule = (c, i) => {
  if (c.s[i] !== '`') return null
  const n = runLength(c.s, i)
  const close = searchOnce(c, '`' + n, i + n, () => findRun(c.s, n, i + n))
  if (close < 0) {
    c.out.text(c.s.slice(i, i + n))
    return i + n
  }
  c.out.node({ type: 'code', text: c.s.slice(i + n, close) })
  return close + n
}

const tryAutolink: Rule = (c, i) => {
  if (c.s[i] !== '<') return null
  AUTOLINK.lastIndex = i
  const m = AUTOLINK.exec(c.s)
  if (!m) return null
  c.out.node({ type: 'autolink', text: m[1] })
  return i + m[0].length
}

/** Link cru vai inteiro como texto: `_`/`*` dentro do endereço não formatam. */
const tryRawUrl: Rule = (c, i) => {
  if (isWord(c.s[i - 1])) return null
  URL_START.lastIndex = i
  if (!URL_START.test(c.s)) return null
  let end = i
  while (end < c.s.length && !URL_STOP.test(c.s[end])) end++
  c.out.text(c.s.slice(i, end))
  return end
}

const tryStyle: Rule = (c, i) => {
  for (const d of DELIMS) {
    if (!c.s.startsWith(d.mark, i) || (d.open && !d.open(c.s, i))) continue
    // Pelo menos um caractere dentro.
    const start = i + d.mark.length + 1
    const close = searchOnce(c, d.mark, start, () => findClose(c.s, d, start))
    if (close < 0) continue
    const inner = c.s.slice(i + d.mark.length, close)
    c.out.node({ type: d.style, children: parseInline(inner, c.depth + 1) })
    return close + d.mark.length
  }
  return null
}

const RULES: Rule[] = [tryEscape, tryCode, tryAutolink, tryRawUrl, tryStyle]

function step(c: Ctx, i: number): number {
  for (const rule of RULES) {
    const next = rule(c, i)
    if (next !== null) return next
  }
  c.out.text(c.s[i])
  return i + 1
}

/** Texto de um bloco → trechos. Marcador sem par sai literal. */
export function parseInline(s: string, depth = 0): MdInline[] {
  const c: Ctx = { s, out: new Builder(), depth, failed: new Map() }
  if (depth > MAX_DEPTH) {
    c.out.text(s)
    return c.out.done()
  }
  let i = 0
  while (i < s.length) i = step(c, i)
  return c.out.done()
}
