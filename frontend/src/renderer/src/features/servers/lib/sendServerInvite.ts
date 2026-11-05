import { getInviteCode } from '../api/servers'
import { getOrCreateConversationWith } from '../../chat/api/conversations'
import { sendConversationMessage } from '../../chat/api/messages'
import { useInviteCodeStore } from '../store/inviteCodeStore'
import { appInviteLink } from './appInviteLink'

export interface SendInviteDeps {
  getCode: (serverId: string) => Promise<string>
  openDM: (userId: string) => Promise<{ id: string }>
  send: (conversationId: string, content: string) => Promise<unknown>
  link: (code: string) => string
}

/** O código já carregado pelo modal (InviteCodeBox) ou, sem ele, o do servidor. */
async function currentCode(serverId: string): Promise<string> {
  const cached = useInviteCodeStore.getState().codes[serverId]
  if (cached) return cached
  const { code } = await getInviteCode(serverId)
  useInviteCodeStore.getState().set(serverId, code)
  return code
}

const defaultDeps: SendInviteDeps = {
  getCode: currentCode,
  openDM: getOrCreateConversationWith,
  send: (conversationId, content) => sendConversationMessage(conversationId, content),
  link: appInviteLink
}

/**
 * "Convidar" um amigo, como no Discord: o link do convite vai na DM de
 * vocês, onde vira o cartão do servidor (ServerInviteEmbed). O backend valida
 * amizade e bloqueio ao abrir a DM.
 */
export async function sendServerInvite(
  serverId: string,
  friendId: string,
  deps: SendInviteDeps = defaultDeps
): Promise<void> {
  const code = await deps.getCode(serverId)
  const conversation = await deps.openDM(friendId)
  await deps.send(conversation.id, deps.link(code))
}
