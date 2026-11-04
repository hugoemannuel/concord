import { describe, expect, it, vi } from 'vitest'
import type { GifItem } from '../api/gifs'
import type { ServerSticker } from '../api/stickers'
import { sendGif, sendSticker, type MediaSendEnv } from './sendMedia'

function env(over: Partial<MediaSendEnv> = {}): MediaSendEnv {
  return {
    send: vi.fn(async () => undefined),
    room: 'canal-1',
    draft: 'olha isso',
    replyId: 'm9',
    begin: vi.fn(),
    clearDraft: vi.fn(),
    onError: vi.fn(),
    ...over
  }
}

const gif = {
  id: 'g',
  title: '',
  url: 'https://static.klipy.com/ii/a/b.gif',
  preview_url: 'https://static.klipy.com/ii/a/s.gif',
  width: 400,
  height: 300
} as GifItem

describe('sendGif', () => {
  it('manda a URL e as medidas com o texto do campo, na resposta aberta, e limpa o campo', async () => {
    const e = env()
    await sendGif(e, gif)
    expect(e.begin).toHaveBeenCalled()
    expect(e.send).toHaveBeenCalledWith('canal-1', 'olha isso', [], 'm9', {
      gifUrl: gif.url,
      gifMetadata: { width: 400, height: 300, preview_url: gif.preview_url }
    })
    expect(e.clearDraft).toHaveBeenCalled()
  })

  it('se falhar avisa e não limpa o campo', async () => {
    const e = env({ send: vi.fn(async () => Promise.reject(new Error('x'))) })
    await sendGif(e, gif)
    expect(e.onError).toHaveBeenCalledWith('Não foi possível enviar o GIF.')
    expect(e.clearDraft).not.toHaveBeenCalled()
  })
})

describe('sendSticker', () => {
  it('manda só o id da figurinha, sem o texto do campo', async () => {
    const e = env()
    await sendSticker(e, { id: 's1' } as ServerSticker)
    expect(e.send).toHaveBeenCalledWith('canal-1', '', [], 'm9', { stickerId: 's1' })
  })

  it('se falhar avisa', async () => {
    const e = env({ send: vi.fn(async () => Promise.reject(new Error('x'))) })
    await sendSticker(e, { id: 's1' } as ServerSticker)
    expect(e.onError).toHaveBeenCalledWith('Não foi possível enviar a figurinha.')
  })
})
