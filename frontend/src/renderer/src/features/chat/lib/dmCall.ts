import type { CallUserInfo } from '../../call/store/callStore'

// Botão de ligar do cabeçalho da DM. Estar em outra call não impede: ligar
// troca de call (estilo Discord). Na call com esta pessoa, o botão vira
// "Encerrar chamada" (DmCallButton).

export function dmCallButton(o: { online: boolean; hasConversation: boolean; blocked: boolean }): {
  disabled: boolean
  title: string
} {
  return {
    disabled: !o.online || !o.hasConversation || o.blocked,
    title: o.online ? 'Iniciar chamada de voz' : 'Usuário offline'
  }
}

/** Liga para a pessoa; sem conversa aberta ou sem pessoa na rota, não faz nada. */
export function startDmCall(
  start: (conversationId: string, peer: CallUserInfo) => Promise<void> | void,
  o: { conversationId: string | null; userId: string | undefined; handle: string; name: string }
): void {
  if (!o.conversationId || !o.userId) return
  void start(o.conversationId, { id: o.userId, username: o.handle, display_name: o.name })
}
