import { useEffect, useMemo, useState } from 'react'
import { useAuthStore } from '../../auth/store/authStore'
import { fallbackMenuData, loadServerMenuData, type ServerMenuData } from '../lib/serverAccessLoad'
import { useServerStore } from '../store/serverStore'
import { useServerAccess } from './useServerAccess'

/**
 * Servidor, membros e permissões do servidor do menu. Se é o aberto, vêm dos
 * stores (nada a buscar). Se não é, busca por baixo sem trocar a tela: até a
 * resposta chegar vale o mínimo de todo membro (`fallbackMenuData`).
 */
export function useServerMenuData(serverId: string): ServerMenuData | null {
  const meId = useAuthStore((s) => s.user?.id)
  const open = useServerStore((s) => s.currentServer)
  const members = useServerStore((s) => s.currentMembers)
  const listed = useServerStore((s) => s.servers.find((srv) => srv.id === serverId))
  const openAccess = useServerAccess()
  const isOpen = open?.id === serverId
  const [loaded, setLoaded] = useState<ServerMenuData | null>(null)

  useEffect(() => {
    if (isOpen) return
    let alive = true
    loadServerMenuData(serverId, meId).then(
      (data) => alive && setLoaded(data),
      () => alive && setLoaded(null)
    )
    return () => {
      alive = false
      setLoaded(null)
    }
  }, [serverId, meId, isOpen])

  return useMemo(() => {
    if (isOpen && open) return { server: open, members, access: openAccess }
    if (loaded?.server.id === serverId) return loaded
    return listed ? fallbackMenuData(listed, meId) : null
  }, [isOpen, open, members, openAccess, loaded, serverId, listed, meId])
}
