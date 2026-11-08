import { linkify } from '../../chat/lib/linkify'
import { stripCode } from '../../chat/lib/markdown/stripCode'
import { parseOwnInviteUrl } from '../../servers/lib/inviteLink'

/** Prévias por mensagem (os primeiros links), como no Discord. */
export const MAX_PREVIEWS = 3

/** <url>: no Discord, os sinais de menor/maior em volta do link tiram a prévia. */
const BRACKETED = /<https?:\/\/[^\s<>]+>/giu

/** Tira o código (o mesmo leitor que desenha o Markdown) e os <url>. */
function withoutSuppressed(content: string): string {
  return stripCode(content).replace(BRACKETED, ' ')
}

/**
 * Os links da mensagem que ganham cartão: até MAX_PREVIEWS, na ordem, sem
 * repetir, fora de código e de <url>, e sem os convites nossos (esses já têm
 * o cartão do servidor).
 */
export function previewLinks(
  content: string,
  serverOrigins: readonly (string | undefined)[] = []
): string[] {
  const links: string[] = []
  for (const part of linkify(withoutSuppressed(content))) {
    const href = part.href
    if (!href || links.includes(href) || parseOwnInviteUrl(href, serverOrigins)) continue
    links.push(href)
    if (links.length === MAX_PREVIEWS) break
  }
  return links
}
