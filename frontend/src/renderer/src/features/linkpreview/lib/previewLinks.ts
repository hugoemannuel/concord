import { linkify } from '../../chat/lib/linkify'
import { parseOwnInviteUrl } from '../../servers/lib/inviteLink'

/** Prévias por mensagem (os primeiros links), como no Discord. */
export const MAX_PREVIEWS = 3

/**
 * Trechos que não ganham prévia: bloco ```…```, código `…` e <url> (no
 * Discord, os sinais de menor/maior em volta do link tiram a prévia).
 *
 * Detecção mínima e local: quando a branch feat/chat-markdown entrar, troque
 * pelo leitor de features/chat/lib/markdown (o mesmo que desenha o código).
 */
const SUPPRESSED = /```[\s\S]*?```|`[^`\n]+`|<https?:\/\/[^\s<>]+>/giu

/** Troca os trechos sem prévia por espaços (as posições do resto não mudam). */
function maskSuppressed(content: string): string {
  return content.replace(SUPPRESSED, (chunk) => ' '.repeat(chunk.length))
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
  for (const part of linkify(maskSuppressed(content))) {
    const href = part.href
    if (!href || links.includes(href) || parseOwnInviteUrl(href, serverOrigins)) continue
    links.push(href)
    if (links.length === MAX_PREVIEWS) break
  }
  return links
}
