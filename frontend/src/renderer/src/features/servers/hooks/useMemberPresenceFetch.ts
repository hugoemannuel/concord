import { useEffect, useState } from 'react'
import { useServerStore } from '../store/serverStore'
import { useChatStore } from '../../chat/store/chatStore'
import { createMemberPresenceFetch } from '../lib/memberPresenceFetch'

/**
 * Busca a presença dos membros do servidor da rota: todos ao abrir, depois só
 * quem entrar (ver lib/memberPresenceFetch.ts).
 */
export function useMemberPresenceFetch(routeServerId: string | undefined): void {
  // Os membros só valem quando o servidor carregado é o da rota (na troca, o
  // anterior ainda fica na tela até a resposta chegar).
  const serverId = useServerStore((s) =>
    s.currentServer && s.currentServer.id === routeServerId ? routeServerId : null
  )
  const members = useServerStore((s) => s.currentMembers)
  const [sync] = useState(() =>
    createMemberPresenceFetch((ids) => void useChatStore.getState().fetchPresenceFor(ids))
  )

  useEffect(() => {
    sync(serverId, members)
  }, [sync, serverId, members])
}
