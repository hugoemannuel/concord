import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('../hooks/useStickerSrc', () => ({ useStickerSrc: () => 'https://x/stickers/stk/file?token=t' }))

import MessageSticker from './MessageSticker'

const sticker = { id: 'stk', server_id: 's', name: 'gato', content_type: 'image/png' }

describe('MessageSticker', () => {
  it('a figurinha é um botão: clicar mostra de que servidor ela veio', () => {
    const html = renderToStaticMarkup(<MessageSticker sticker={sticker} />)
    expect(html).toContain('aria-haspopup="dialog"')
    expect(html).toContain('aria-label=":gato:"')
    expect(html).toContain('src="https://x/stickers/stk/file?token=t"')
  })
})
