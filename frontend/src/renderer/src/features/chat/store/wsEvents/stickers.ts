// Figurinhas: o stickerStore cuida da lista; aqui, a figurinha apagada some
// das mensagens já carregadas.
import type { WsEvent } from '../../../../shared/api/ws'
import type { Message } from '../../api/messages'
import type { MessagesByRoom } from '../../lib/roomMessages'
import type { ChatWsContext } from './context'
import { useStickerStore } from '../stickerStore'

const usesSticker = (m: Message, stickerId: string): boolean =>
  m.sticker_id === stickerId || m.sticker?.id === stickerId

const withoutStickerIn = (list: Message[], stickerId: string): Message[] =>
  list.map((m) =>
    usesSticker(m, stickerId)
      ? { ...m, sticker_id: null, sticker: null, deleted_sticker_name: m.sticker?.name ?? m.deleted_sticker_name }
      : m
  )

/** Tira a figurinha das mensagens que a usam; sem nenhuma, devolve null. */
export function withoutSticker(
  messagesByRoom: MessagesByRoom,
  stickerId: string
): MessagesByRoom | null {
  let changed = false
  const next: MessagesByRoom = {}
  for (const [room, list] of Object.entries(messagesByRoom)) {
    const uses = list.some((m) => usesSticker(m, stickerId))
    changed ||= uses
    next[room] = uses ? withoutStickerIn(list, stickerId) : list
  }
  return changed ? next : null
}

/** Evento de figurinha? Passa ao stickerStore e devolve true se ele tratou. */
export function handleStickerEvent(event: WsEvent, ctx: ChatWsContext): boolean {
  if (!useStickerStore.getState().handleWsEvent(event)) return false
  const stickerId = (event.payload as Record<string, unknown> | null)?.sticker_id as
    string | undefined
  if (event.type !== 'sticker:deleted' || !stickerId) return true
  ctx.set((state) => {
    const messagesByRoom = withoutSticker(state.messagesByRoom, stickerId)
    return messagesByRoom ? { messagesByRoom } : {}
  })
  return true
}
