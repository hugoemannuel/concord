import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { showToast } from '../../../shared/store/toastStore'
import type { GifItem } from '../api/gifs'
import type { Message } from '../api/messages'
import type { ServerSticker } from '../api/stickers'
import { sendGif, sendSticker, type MediaSendEnv } from '../lib/sendMedia'
import type { ReplyState } from '../lib/sendFailure'
import { useChatStore } from '../store/chatStore'

/** Enviar figurinha e GIF do seletor para a sala aberta (a resposta aberta vai junto). */
export function useSendMedia({
  room,
  draft,
  setDraft,
  replyingTo,
  setReplyState,
  stickToBottom
}: {
  room: string
  draft: string
  setDraft: Dispatch<SetStateAction<string>>
  replyingTo: Message | null
  setReplyState: (state: ReplyState | null) => void
  stickToBottom: MutableRefObject<boolean>
}): { handleSendSticker: (s: ServerSticker) => Promise<void>; handleSendGif: (g: GifItem) => Promise<void> } {
  const sendToRoom = useChatStore((s) => s.sendToRoom)
  const env: MediaSendEnv = {
    send: sendToRoom,
    room,
    draft,
    replyId: replyingTo?.id ?? null,
    begin: () => {
      stickToBottom.current = true
      setReplyState(null)
    },
    clearDraft: () => setDraft(''),
    onError: showToast.error
  }
  return {
    handleSendSticker: (sticker) => sendSticker(env, sticker),
    handleSendGif: (gif) => sendGif(env, gif)
  }
}
