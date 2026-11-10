import type { GifItem } from '../api/gifs'
import type { ServerSticker } from '../api/stickers'
import { slowmodeErrorText, slowmodeRetryAfter } from './slowmode'

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
  /** Modo lento da sala: na espera não envia; conta a vez depois de enviar e trava no 429. */
  slowmode?: { blocked: boolean; onSent: (text: string) => void; onFailed: (err: unknown) => void }
}

interface GifMetadataToSend {
  width: number
  height: number
  preview_url: string
}

/** Falha ao enviar mídia: no modo lento, quanto falta; senão, o aviso da mídia. */
function mediaFailed(env: MediaSendEnv, err: unknown, fallback: string): void {
  env.slowmode?.onFailed(err)
  const retryAfter = slowmodeRetryAfter(err)
  env.onError(retryAfter === null ? fallback : slowmodeErrorText(retryAfter))
}

export async function sendSticker(env: MediaSendEnv, sticker: ServerSticker): Promise<void> {
  if (env.slowmode?.blocked) return
  env.begin()
  try {
    await env.send(env.room, '', [], env.replyId, { stickerId: sticker.id })
    env.slowmode?.onSent('')
  } catch (err) {
    mediaFailed(env, err, 'Não foi possível enviar a figurinha.')
  }
}

/** O GIF vai com o texto do campo e só limpa o campo se o envio deu certo. */
export async function sendGif(env: MediaSendEnv, gif: GifItem): Promise<void> {
  if (env.slowmode?.blocked) return
  env.begin()
  try {
    await env.send(env.room, env.draft, [], env.replyId, {
      gifUrl: gif.url,
      gifMetadata: { width: gif.width, height: gif.height, preview_url: gif.preview_url }
    })
    env.clearDraft()
    env.slowmode?.onSent('')
  } catch (err) {
    mediaFailed(env, err, 'Não foi possível enviar o GIF.')
  }
}
