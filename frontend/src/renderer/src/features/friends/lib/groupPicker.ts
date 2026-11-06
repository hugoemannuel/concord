import { errorMessage } from '../../../shared/lib/errorMessage'
import {
  MAX_GROUP_MEMBERS,
  type Conversation,
  type ConversationSummary
} from '../../chat/api/conversations'
import { conversationRoute } from '../../chat/lib/conversations'

interface PickableFriend {
  id: string
  username: string
  display_name: string
}

/** Amigos que ainda podem entrar: fora do grupo e batendo com a busca (usuário ou nome). */
export function filterAvailableFriends<T extends PickableFriend>(
  friends: T[],
  existingIds: string[],
  query: string
): T[] {
  const q = query.trim().toLowerCase()
  return friends
    .filter((f) => !existingIds.includes(f.id))
    .filter(
      (f) => !q || f.username.toLowerCase().includes(q) || f.display_name.toLowerCase().includes(q)
    )
}

/** Vagas que sobram (até 10 pessoas, contando você). */
export const freeSlots = (existingCount: number, selectedCount: number): number =>
  MAX_GROUP_MEMBERS - Math.max(existingCount, 1) - selectedCount

/** Marca/desmarca um amigo; sem vaga, não marca mais ninguém. */
export const toggleSelected = (cur: string[], id: string, slots: number): string[] =>
  cur.includes(id) ? cur.filter((x) => x !== id) : slots > 0 ? [...cur, id] : cur

export const slotsHint = (slots: number): string =>
  slots > 0
    ? `Você pode adicionar mais ${slots} ${slots === 1 ? 'amigo' : 'amigos'}.`
    : 'Este grupo já está cheio.'

export const groupSubmitLabel = (groupId: string | undefined, selectedCount: number): string =>
  groupId ? 'Adicionar' : selectedCount > 1 ? 'Criar grupo' : 'Criar DM'

/** Para onde ir depois de criar: a conversa já na lista ou, sem ela, pelo id/amigo escolhido. */
export function createdConversationRoute(
  conv: Conversation,
  summary: ConversationSummary | undefined,
  meId: string | undefined,
  firstSelected: string
): string {
  if (summary) return conversationRoute(summary, meId)
  return conv.type === 'group' ? `/dm/c/${conv.id}` : `/dm/${firstSelected}`
}

/** O que confirmar a seleção usa de fora (API, conversas, navegação e aviso). */
export interface GroupSubmitDeps {
  addMembers: (groupId: string, userIds: string[]) => Promise<unknown>
  createGroup: (userIds: string[]) => Promise<Conversation>
  fetchConversations: () => Promise<unknown>
  findSummary: (conversationId: string) => ConversationSummary | undefined
  navigate: (to: string) => void
  done: () => void
  error: (message: string) => void
}

interface GroupSelection {
  groupId?: string
  selected: string[]
  meId: string | undefined
}

async function createAndOpen(
  deps: GroupSubmitDeps,
  { selected, meId }: GroupSelection
): Promise<void> {
  const conv = await deps.createGroup(selected)
  await deps.fetchConversations()
  deps.navigate(createdConversationRoute(conv, deps.findSummary(conv.id), meId, selected[0]))
}

/** Adiciona ao grupo existente ou cria a DM/grupo e abre; fecha o modal se deu certo. */
export async function submitGroupSelection(
  deps: GroupSubmitDeps,
  sel: GroupSelection
): Promise<void> {
  try {
    if (sel.groupId) {
      await deps.addMembers(sel.groupId, sel.selected)
      await deps.fetchConversations()
    } else {
      await createAndOpen(deps, sel)
    }
    deps.done()
  } catch (err) {
    deps.error(errorMessage(err, 'Não foi possível criar o grupo.'))
  }
}
