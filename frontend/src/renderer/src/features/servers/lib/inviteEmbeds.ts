import { linkify } from '../../chat/lib/linkify'
import { parseOwnInviteUrl } from './inviteLink'

/** Cartões de convite por mensagem; os outros links ficam só como link. */
export const MAX_INVITE_EMBEDS = 3

/**
 * Códigos dos links de convite nossos no texto da mensagem, na ordem, sem
 * repetir (o cartão do servidor aparece embaixo, como no Discord). Link de
 * outro site, mesmo com /convite/, não vira cartão.
 */
export function inviteCodesIn(
  content: string,
  serverOrigins: readonly (string | undefined)[] = []
): string[] {
  const codes: string[] = []
  for (const part of linkify(content)) {
    const code = part.href ? parseOwnInviteUrl(part.href, serverOrigins) : null
    if (code && !codes.includes(code)) codes.push(code)
    if (codes.length === MAX_INVITE_EMBEDS) break
  }
  return codes
}
