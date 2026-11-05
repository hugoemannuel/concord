// DMs com mensagem não lida que aparecem no trilho, logo abaixo do início
// (como no Discord): o avatar de quem mandou e quantas mensagens são.

/** Quantas aparecem no trilho; as outras continuam no selo do início. */
export const MAX_RAIL_DMS = 5

interface RailConversation {
  id: string
  updated_at: string
  last_message?: { created_at: string }
}

export interface RailDm<C extends RailConversation> {
  conv: C
  unread: number
}

const lastActivity = (conv: RailConversation): number =>
  Date.parse(conv.last_message?.created_at ?? conv.updated_at) || 0

/** As conversas não lidas, da mensagem mais nova para a mais velha. */
export function unreadRailDms<C extends RailConversation>(
  conversations: C[],
  unreadByRoom: Record<string, number>
): RailDm<C>[] {
  return conversations
    .map((conv) => ({ conv, unread: unreadByRoom[`conversation:${conv.id}`] ?? 0 }))
    .filter((entry) => entry.unread > 0)
    .sort((a, b) => lastActivity(b.conv) - lastActivity(a.conv))
    .slice(0, MAX_RAIL_DMS)
}

/** O que o leitor de tela fala (e a dica do mouse): nome e quantas mensagens. */
export function railDmLabel(name: string, unread: number): string {
  return unread === 1 ? `${name}, 1 mensagem não lida` : `${name}, ${unread} mensagens não lidas`
}
