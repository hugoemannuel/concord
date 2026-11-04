import { createContext, useContext } from 'react'
import { useMemberProfileStore } from '../store/memberProfileStore'
import type { MemberProfile } from '../lib/memberProfile'

/**
 * De que servidor são as pessoas desta parte da tela (null = fora de servidor:
 * DMs, amigos, ranking, tudo com o perfil global). Avatar, nome e faixa leem
 * daqui sem precisar receber o servidor por prop.
 */
export const ProfileScopeContext = createContext<string | null>(null)

export function useProfileScope(): string | null {
  return useContext(ProfileScopeContext)
}

/** O perfil do servidor de alguém, no servidor desta parte da tela. */
export function useScopedMemberProfile(userId: string | null | undefined): MemberProfile | undefined {
  const serverId = useProfileScope()
  return useMemberProfileStore((s) => (serverId && userId ? s.byServer[serverId]?.[userId] : undefined))
}
