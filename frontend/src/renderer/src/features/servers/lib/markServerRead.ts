/** O pedaço do chatStore que "Marcar como lido" lê e troca. */
export interface UnreadState {
  channelsByServer: Record<string, string[]>
  unreadByRoom: Record<string, number>
  mentionsByRoom: Record<string, number>
  unreadByServer: Record<string, number>
  mentionsByServer: Record<string, number>
}

/**
 * "Marcar como lido": o que muda no chatStore para zerar as não lidas e as
 * menções do servidor e de cada canal dele. Só o app guarda isso (o servidor
 * não tem "lido" por canal). Uso: `useChatStore.setState((s) => readServerPatch(s, id))`.
 */
export function readServerPatch(
  state: UnreadState,
  serverId: string
): Pick<UnreadState, 'unreadByRoom' | 'mentionsByRoom' | 'unreadByServer' | 'mentionsByServer'> {
  const rooms = (state.channelsByServer[serverId] ?? []).map((id) => `channel:${id}`)
  const cleared = (map: Record<string, number>): Record<string, number> => {
    const next = { ...map }
    for (const room of rooms) if (room in next) next[room] = 0
    return next
  }
  return {
    unreadByRoom: cleared(state.unreadByRoom),
    mentionsByRoom: cleared(state.mentionsByRoom),
    unreadByServer: { ...state.unreadByServer, [serverId]: 0 },
    mentionsByServer: { ...state.mentionsByServer, [serverId]: 0 }
  }
}
