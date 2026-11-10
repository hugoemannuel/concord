import { useEffect } from 'react'
import { useNow } from '../../../shared/hooks/useNow'
import { useAuthStore } from '../../auth/store/authStore'
import { useServerStore } from '../../servers/store/serverStore'
import { activeEffects, castigoEndsAt, hasAnyEffect, type CastigoEffects } from '../lib/castigo'
import { useCastigoStore } from '../store/castigoStore'

/** Carrega os castigos do servidor aberto (e os relê ao trocar de servidor). */
export function useServerCastigosLoad(): void {
  const serverId = useServerStore((s) => s.currentServer?.id)
  useEffect(() => {
    if (serverId)
      void useCastigoStore
        .getState()
        .load(serverId)
        .catch(() => {})
  }, [serverId])
}

/** O meu castigo no servidor aberto: o que vale e quando acaba (null sem castigo). */
export function useMyCastigo(): { effects: CastigoEffects; endsAt: number } | null {
  const serverId = useServerStore((s) => s.currentServer?.id)
  const meId = useAuthStore((s) => s.user?.id)
  const castigo = useCastigoStore((s) =>
    serverId && meId ? s.byServer[serverId]?.[meId] : undefined
  )
  const now = useNow(5_000)
  const effects = activeEffects(castigo, now)
  const endsAt = castigoEndsAt(castigo, now)
  return hasAnyEffect(effects) && endsAt ? { effects, endsAt } : null
}
