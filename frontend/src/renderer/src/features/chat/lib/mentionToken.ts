// Onde uma menção (@nick, @all/@here, @cargo) pode começar e acabar no texto.
// Mesma regra do backend (internal/message/mention.go).

/**
 * O que pode vir logo antes do "@": começo, espaço ou pontuação de abertura.
 * Assim "x.com/@ana" ou "medium.com/@here" (links) não viram menção. Mesma
 * regra do backend (internal/message/mention.go).
 */
export const OPENER = `(^|[\\s([{"'<*~“‘«])`

const OPENS_BEFORE = new RegExp(`${OPENER}$`)

/** O "@" em `at` pode abrir uma menção? (começo do texto ou OPENER logo antes) */
export function opensToken(text: string, at: number): boolean {
  return at === 0 || OPENS_BEFORE.test(text[at - 1])
}

/** Pontuação que pode vir logo depois do nick (apóstrofo e ponto têm regra própria). */
const CLOSERS = ',!?:;)]}"”»>*~'

/**
 * O nick acaba em `end`? Só se vier fim, espaço ou pontuação de fechamento.
 * Letra, número, "-", "_", "@", "/" ou apóstrofo seguido de letra ("@all's")
 * continuam a palavra; ponto seguido de nick também ("@ana.bot"), mas ponto
 * final conta ("@ana."). Mesma regra do backend (tokenEndsAt em mention.go).
 */
export function tokenEndsAt(text: string, end: number): boolean {
  if (end >= text.length) return true
  const ch = text[end]
  if (/\s/.test(ch)) return true
  if (ch === '.') {
    let j = end
    while (j < text.length && text[j] === '.') j++
    if (j >= text.length) return true
    if (/[A-Za-z0-9_]/.test(text[j])) return false
    return tokenEndsAt(text, j)
  }
  if (ch === "'" || ch === '’') {
    const next = text.codePointAt(end + 1)
    return next === undefined || !/\p{L}/u.test(String.fromCodePoint(next))
  }
  return CLOSERS.includes(ch)
}
