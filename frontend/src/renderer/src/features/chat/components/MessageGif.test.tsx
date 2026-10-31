import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import MessageGif from './MessageGif'

describe('MessageGif', () => {
  it('GIF do GIPHY tem a estrela de favoritar, sempre visível no toque e no teclado', () => {
    const html = renderToStaticMarkup(
      <MessageGif gifUrl="https://media3.giphy.com/media/abc123/giphy.gif" />
    )
    expect(html).toContain('aria-label="Favoritar GIF"')
    // Só some onde há hover; no toque a estrela fica sempre visível.
    expect(html).toContain('[@media(hover:hover)]:opacity-0')
    expect(html).toContain('focus-visible:opacity-100')
  })

  it('URL que não é do GIPHY não mostra a estrela (não dá para tirar o id)', () => {
    const html = renderToStaticMarkup(<MessageGif gifUrl="https://exemplo.com/a.gif" />)
    expect(html).not.toContain('Favoritar GIF')
  })
})
