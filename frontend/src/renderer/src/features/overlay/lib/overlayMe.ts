import { serverDisplayName } from '../../servers/lib/serverNames'
import { withMemberProfiles, type MemberProfile } from '../../memberProfiles/lib/memberProfile'

interface Person {
  id: string
  username?: string
  display_name: string
  avatar_url?: string | null
}

/**
 * Eu no overlay: numa call de servidor, com o apelido e o perfil de lá (a janela
 * do overlay recebe tudo resolvido). Sem nada disso, o mesmo objeto.
 */
export function overlayMe<T extends Person>(
  me: T | null,
  nicknames: Record<string, string> | undefined,
  profiles: Record<string, MemberProfile> | undefined
): T | null {
  if (!me) return me
  const nickname = nicknames?.[me.id]
  const named = nickname ? { ...me, display_name: serverDisplayName({ nickname }, me) } : me
  return withMemberProfiles([named], profiles)[0]
}
