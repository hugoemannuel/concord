import { createContext, useContext } from 'react'
import { useServerProfileStore } from '../store/serverProfileStore'
import type { ServerProfile } from '../lib/serverProfile'

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
export function useScopedServerProfile(userId: string | null | undefined): ServerProfile | undefined {
  const serverId = useProfileScope()
  return useServerProfileStore((s) => (serverId && userId ? s.byServer[serverId]?.[userId] : undefined))
}
