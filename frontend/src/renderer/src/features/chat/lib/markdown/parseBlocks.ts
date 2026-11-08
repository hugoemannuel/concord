import { parseInline } from './parseInline'
import type { MdBlock, MdList } from './types'

// Blocos da mensagem (regras do Discord), sempre no começo da linha: bloco de
// código, citação (> e >>>), títulos (# a ###), listas, subtexto (-#) e
// parágrafo. O texto de cada bloco vira trechos no parseInline.

const FENCE = '```'
const HEADING = /^(#{1,3}) +(\S.*)$/
const SUBTEXT = /^-# +(\S.*)$/
const LIST_ITEM = /^( *)([-*]|\d{1,9}\.) +(\S.*)$/
/** Primeira linha do bloco de código que é a linguagem (aceita e ignorada). */
const LANG = /^[\w+#.-]*$/

interface Cursor {
  lines: string[]
  i: number
  /** Dentro de citação não há outra citação (como no Discord). */
  inQuote: boolean
}

const current = (c: Cursor): string => c.lines[c.i]

function isQuoteStart(line: string, inQuote: boolean): boolean {
  return !inQuote && (line.startsWith('> ') || line.startsWith('>>> '))
}

/** A linha abre outro bloco? (o parágrafo para antes dela) */
function isBlockStart(line: string, inQuote: boolean): boolean {
  return (
    line.startsWith(FENCE) ||
    isQuoteStart(line, inQuote) ||
    HEADING.test(line) ||
    SUBTEXT.test(line) ||
    LIST_ITEM.test(line)
  )
}

/** Separa a linguagem (primeira linha, uma palavra) do conteúdo. */
function splitLang(inner: string): { lang: string; text: string } {
  const nl = inner.indexOf('\n')
  if (nl < 0 || !LANG.test(inner.slice(0, nl))) return { lang: '', text: inner }
  return { lang: inner.slice(0, nl), text: inner.slice(nl + 1).replace(/\n$/, '') }
}

/** Bloco de código a partir da linha atual; sem fechamento, null (vira texto). */
function takeCode(c: Cursor): MdBlock | null {
  const rest = c.lines.slice(c.i).join('\n')
  const close = rest.indexOf(FENCE, FENCE.length)
  if (close < 0) return null
  const after = rest.slice(close + FENCE.length).replace(/^\n/, '')
  c.lines = after ? after.split('\n') : []
  c.i = 0
  return { type: 'code', ...splitLang(rest.slice(FENCE.length, close)) }
}

function takeQuote(c: Cursor): MdBlock {
  const line = current(c)
  if (line.startsWith('>>> ')) {
    const rest = [line.slice(4), ...c.lines.slice(c.i + 1)].join('\n')
    c.i = c.lines.length
    return { type: 'quote', children: parseBlocks(rest, true) }
  }
  const inner: string[] = []
  while (c.i < c.lines.length && current(c).startsWith('> ')) {
    inner.push(current(c).slice(2))
    c.i++
  }
  return { type: 'quote', children: parseBlocks(inner.join('\n'), true) }
}

const newList = (marker: string): MdList => {
  const ordered = marker !== '-' && marker !== '*'
  return { type: 'list', ordered, start: ordered ? parseInt(marker, 10) : 1, items: [] }
}

/** Itens seguidos; recuo de 2+ espaços aninha no item anterior. Trocar o tipo encerra. */
function takeList(c: Cursor): MdList {
  const list = newList(LIST_ITEM.exec(current(c))![2])
  while (c.i < c.lines.length) {
    const m = LIST_ITEM.exec(current(c))
    if (!m) break
    const [, indent, marker, text] = m
    const item = { children: parseInline(text), nested: null }
    const parent = list.items[list.items.length - 1]
    if (indent.length >= 2 && parent) {
      parent.nested ??= newList(marker)
      parent.nested.items.push(item)
    } else if (newList(marker).ordered === list.ordered) {
      list.items.push(item)
    } else {
      break
    }
    c.i++
  }
  return list
}

/** A primeira linha sempre entra (mesmo um ``` sem fechamento); as seguintes até outro bloco. */
function takeParagraph(c: Cursor): MdBlock {
  const lines = [current(c)]
  c.i++
  while (c.i < c.lines.length && !isBlockStart(current(c), c.inQuote)) {
    lines.push(current(c))
    c.i++
  }
  return { type: 'paragraph', children: parseInline(lines.join('\n')) }
}

function takeLine(c: Cursor, regex: RegExp, build: (m: RegExpExecArray) => MdBlock): MdBlock | null {
  const m = regex.exec(current(c))
  if (!m) return null
  c.i++
  return build(m)
}

function takeBlock(c: Cursor): MdBlock {
  const line = current(c)
  const code = line.startsWith(FENCE) ? takeCode(c) : null
  if (code) return code
  if (isQuoteStart(line, c.inQuote)) return takeQuote(c)
  if (LIST_ITEM.test(line)) return takeList(c)
  return (
    takeLine(c, HEADING, (m) => ({
      type: 'heading',
      level: m[1].length as 1 | 2 | 3,
      children: parseInline(m[2])
    })) ??
    takeLine(c, SUBTEXT, (m) => ({ type: 'subtext', children: parseInline(m[1]) })) ??
    takeParagraph(c)
  )
}

/** Texto da mensagem → blocos. */
export function parseBlocks(text: string, inQuote = false): MdBlock[] {
  if (!text) return []
  const c: Cursor = { lines: text.split('\n'), i: 0, inQuote }
  const blocks: MdBlock[] = []
  while (c.i < c.lines.length) blocks.push(takeBlock(c))
  return blocks
}
