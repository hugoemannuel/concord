import type { MentionEveryone, RoleMention } from '../api/messages'
import { isSafeExternalUrl } from '../../../../../shared/externalUrl'
import { splitMentions, type MessagePart } from './mentions'
import { splitCustomEmojis, type CustomEmojiRef } from '../../emojis/lib/emojiToken'

// Links clicáveis no texto das mensagens: http(s)://… e www.… viram <a>.
// Só gera http/https (www. vira https://), nunca javascript:/data:.
//
// Roda a cada render da mensagem, para todo mundo na sala, com texto de
// qualquer membro: tem que ser linear no tamanho do texto. Cada caractere é
// visto um número fixo de vezes (um candidato rejeitado pula a palavra
// inteira, e o fim do link é aparado com contadores, sem reler o link).

export interface LinkPart {
  text: string
  /** destino do link, se este pedaço é um link */
  href?: string
}

/** Pedaço do texto da mensagem: texto, menção (chip), link ou emoji personalizado. */
export type RichPart = MessagePart & { href?: string; emoji?: CustomEmojiRef }

/** Onde um link pode começar: http://, https:// ou www. (sem diferenciar maiúsculas). */
const START = /https?:\/\/|www\./giu

/**
 * O que vem antes precisa abrir uma palavra: começo, espaço ou pontuação.
 * Letra, número, "@", ".", "/", ":" ou "-" logo antes é pedaço de outra
 * coisa — e-mail (ana@www.x.com), @nick, outro link (javascript://https://…)
 * ou palavra (xhttps://).
 */
const GLUED_BEFORE = /[\p{L}\p{N}@./:_-]/u

/**
 * O link acaba no primeiro espaço, aspas, crase, < > ou controle de direção
 * do texto (U+202A–U+202E, U+2066–U+2069), que poderia inverter o que se vê.
 */
const STOP = /[\s<>"`“”‘’«»\u202A-\u202E\u2066-\u2069]/u

/** Link maior que isso fica texto (navegadores e servidores cortam por aí). */
const MAX_LINK_LENGTH = 2048

/** Links por mensagem; daí em diante o resto fica texto. */
const MAX_LINKS = 50

/** Pontuação que, no fim, é da frase e não do link. */
const TRAILING = ".,!?:;'*~"

/**
 * Tira do fim a pontuação da frase: ".,!?" e o ")" ou "]" que não abriu no
 * link. Conta os pares uma vez só e desconta a cada um tirado (linear).
 */
function trimTrailing(candidate: string): string {
  // saldo = abertos − fechados no que sobra do link
  let parens = 0
  let brackets = 0
  for (const c of candidate) {
    if (c === '(') parens++
    else if (c === ')') parens--
    else if (c === '[') brackets++
    else if (c === ']') brackets--
  }
  let end = candidate.length
  while (end > 0) {
    const ch = candidate[end - 1]
    if (TRAILING.includes(ch)) {
      end--
    } else if (ch === ')' && parens < 0) {
      parens++
      end--
    } else if (ch === ']' && brackets < 0) {
      brackets++
      end--
    } else {
      break
    }
  }
  return candidate.slice(0, end)
}

/**
 * O link tem um host de verdade (algo com letra ou número antes do caminho)
 * e sem usuário? "good.com@evil.com" abre evil.com mas parece good.com, então
 * não vira link.
 */
function hasHost(link: string): boolean {
  const rest = link.replace(/^https?:\/\//i, '')
  const authority = rest.split(/[/?#]/, 1)[0]
  if (authority.includes('@')) return false
  return /[\p{L}\p{N}]/u.test(authority) && !authority.startsWith('.')
}

function hrefFor(link: string): string | null {
  const href = /^www\./i.test(link) ? `https://${link}` : link
  if (!hasHost(link) || /^www\.?$/i.test(link)) return null
  return isSafeExternalUrl(href) ? href : null
}

/**
 * Quebra o texto em pedaços normais e links. Pontuação final (".,!?" e um
 * ")" sem par no link) fica de fora; "(" e ")" balanceados ficam
 * (wikipedia.org/wiki/Rio_(cidade)). Juntando os pedaços volta o texto.
 */
export function linkify(text: string): LinkPart[] {
  const parts: LinkPart[] = []
  const pushText = (chunk: string): void => {
    if (!chunk) return
    const prev = parts[parts.length - 1]
    if (prev && !prev.href) prev.text += chunk
    else parts.push({ text: chunk })
  }

  let last = 0
  let found = 0
  START.lastIndex = 0
  for (let match = START.exec(text); match && found < MAX_LINKS; match = START.exec(text)) {
    const start = match.index
    let end = start + match[0].length
    while (end < text.length && !STOP.test(text[end])) end++
    // Rejeitado: a busca segue depois desta palavra, não dentro dela.
    START.lastIndex = end

    // Último caractere antes do link (um emoji ocupa duas posições).
    const prevChar = Array.from(text.slice(Math.max(0, start - 2), start)).pop() ?? ''
    if (prevChar && GLUED_BEFORE.test(prevChar)) continue
    if (end - start > MAX_LINK_LENGTH) continue

    const link = trimTrailing(text.slice(start, end))
    const href = link.length > match[0].length ? hrefFor(link) : null
    if (!href) continue

    pushText(text.slice(last, start))
    parts.push({ text: link, href })
    found++
    last = start + link.length
    // O que foi aparado do fim (".", ")") volta para a busca: não tem "h"/"w".
    START.lastIndex = last
  }
  pushText(text.slice(last))
  return parts.length ? parts : [{ text }]
}

/**
 * Texto da mensagem pronto para desenhar: links primeiro (o "@" dentro de um
 * link não vira menção) e, no resto, as menções do splitMentions. Um link
 * nunca começa colado num "@nick", então não há link dentro de chip.
 */
/** Texto fora de link: emojis personalizados primeiro, menções no resto. */
function textParts(
  text: string,
  everyone: MentionEveryone | null,
  roles?: readonly RoleMention[]
): RichPart[] {
  return splitCustomEmojis(text).flatMap((p) =>
    p.emoji ? [p] : splitMentions(p.text, everyone, roles)
  )
}

/** `roles`: os cargos que a mensagem pingou (mention_roles); viram chip de cargo. */
export function messageParts(
  content: string,
  everyone: MentionEveryone | null,
  roles?: readonly RoleMention[]
): RichPart[] {
  const out: RichPart[] = []
  for (const part of linkify(content)) {
    if (part.href) out.push(part)
    else if (part.text) out.push(...textParts(part.text, everyone, roles))
  }
  return out.length ? out : [{ text: content }]
}
