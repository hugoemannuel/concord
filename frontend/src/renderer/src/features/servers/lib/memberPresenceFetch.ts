// Presença (e atividade) dos membros do servidor aberto: busca uma vez ao
// abrir o servidor e, depois, só para quem entrou. Apelido, cargo ou a
// releitura da lista trocam o array de membros, mas não pedem busca nova: o
// WebSocket já mantém a presença de quem foi buscado em dia.

interface MemberRef {
  user_id: string
}

/** Recebe o servidor aberto (null = ainda carregando) e os membros dele. */
export type MemberPresenceSync = (serverId: string | null, members: readonly MemberRef[]) => void

export function createMemberPresenceFetch(fetch: (userIds: string[]) => void): MemberPresenceSync {
  let current: string | null = null
  let fetched = new Set<string>()

  return (serverId, members) => {
    if (!serverId) return
    if (serverId !== current) {
      current = serverId
      fetched = new Set()
    }
    const fresh = [...new Set(members.map((m) => m.user_id))].filter((id) => !fetched.has(id))
    if (fresh.length === 0) return
    fresh.forEach((id) => fetched.add(id))
    fetch(fresh)
  }
}
