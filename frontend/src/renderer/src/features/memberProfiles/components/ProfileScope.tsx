import type { ReactNode } from 'react'
import { ProfileScopeContext } from '../hooks/useProfileScope'

/** Tudo aqui dentro mostra as pessoas com o perfil daquele servidor. */
export default function ProfileScope({
  serverId,
  children
}: {
  serverId: string | null | undefined
  children: ReactNode
}): React.JSX.Element {
  return <ProfileScopeContext.Provider value={serverId ?? null}>{children}</ProfileScopeContext.Provider>
}
