// Tira o código (bloco ``` e `trecho`) do texto antes de procurar menções:
// menção dentro de código não pinga, como no Discord. Cada código vira um
// espaço (não cola as palavras de volta). Mesma regra do backend
// (internal/message/mention_code.go) e do leitor (parseBlocks/parseInline).
import { ESCAPABLE, findRun, runLength } from './backticks'

const FENCE = '```'

/** Fim do código que começa em i (crases), ou -1 se não fecha. */
function codeEnd(s: string, i: number, n: number): number {
  const lineStart = i === 0 || s[i - 1] === '\n'
  if (n >= FENCE.length && lineStart) {
    const close = s.indexOf(FENCE, i + FENCE.length)
    return close < 0 ? -1 : close + FENCE.length
  }
  const close = findRun(s, n, i + n)
  return close < 0 ? -1 : close + n
}

export function stripCode(content: string): string {
  let out = ''
  let i = 0
  while (i < content.length) {
    const ch = content[i]
    if (ch === '\\' && ESCAPABLE.test(content[i + 1] ?? '')) {
      out += content.slice(i, i + 2)
      i += 2
      continue
    }
    if (ch !== '`') {
      out += ch
      i++
      continue
    }
    const n = runLength(content, i)
    const end = codeEnd(content, i, n)
    out += end < 0 ? content.slice(i, i + n) : ' '
    i = end < 0 ? i + n : end
  }
  return out
}
