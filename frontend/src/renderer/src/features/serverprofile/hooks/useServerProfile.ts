import { useEffect } from 'react'
import type { ServerProfile } from '../api/serverProfile'
import { useServerProfileStore } from '../store/serverProfileStore'

/** O perfil do servidor em que a pessoa está (faixa, fundo). */
export function useServerProfile(serverId: string | undefined): ServerProfile | undefined {
  const profile = useServerProfileStore((s) => (serverId ? s.byServer[serverId] : undefined))
  useEffect(() => {
    if (serverId) useServerProfileStore.getState().load(serverId)
  }, [serverId])
  return profile
}
