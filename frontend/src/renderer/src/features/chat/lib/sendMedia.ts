import type { GifItem } from '../api/gifs'
import type { ServerSticker } from '../api/stickers'

/** O que enviar figurinha ou GIF precisa do ChatPane (sala, campo, resposta e aviso). */
export interface MediaSendEnv {
  send: (
    room: string,
    text: string,
    attachmentIds: string[],
    replyToId: string | null,
    extra: { stickerId: string } | { gifUrl: string; gifMetadata: GifMetadataToSend }
  ) => Promise<unknown>
  room: string
  /** O que está no campo: segue junto com o GIF. */
  draft: string
  replyId: string | null
  /** Antes de enviar: volta a colar no fim da conversa e fecha a resposta. */
  begin: () => void
  clearDraft: () => void
  onError: (message: string) => void
}

interface GifMetadataToSend {
  width: number
  height: number
  preview_url: string
}

export async function sendSticker(env: MediaSendEnv, sticker: ServerSticker): Promise<void> {
  env.begin()
  try {
    await env.send(env.room, '', [], env.replyId, { stickerId: sticker.id })
  } catch {
    env.onError('Não foi possível enviar a figurinha.')
  }
}

/** O GIF vai com o texto do campo e só limpa o campo se o envio deu certo. */
export async function sendGif(env: MediaSendEnv, gif: GifItem): Promise<void> {
  env.begin()
  try {
    await env.send(env.room, env.draft, [], env.replyId, {
      gifUrl: gif.url,
      gifMetadata: { width: gif.width, height: gif.height, preview_url: gif.preview_url }
    })
    env.clearDraft()
  } catch {
    env.onError('Não foi possível enviar o GIF.')
  }
}
