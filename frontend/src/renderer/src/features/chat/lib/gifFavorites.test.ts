import { describe, expect, it } from 'vitest'
import { gifFromMessage, gifIdFromUrl } from './gifFavorites'

describe('gifIdFromUrl', () => {
  it.each([
    ['https://media3.giphy.com/media/abc123/giphy.gif', 'abc123'],
    ['https://media1.giphy.com/media/v1.Y2lkPTc5/xyz789/giphy.gif?cid=1', 'xyz789'],
    ['https://exemplo.com/foto.gif', ''],
    ['isso não é url', '']
  ])('%s → %s', (url, id) => {
    expect(gifIdFromUrl(url)).toBe(id)
  })
})

describe('gifFromMessage', () => {
  it('monta o item com a prévia e o tamanho da mensagem', () => {
    expect(
      gifFromMessage('https://media3.giphy.com/media/abc123/giphy.gif', {
        width: 480,
        height: 270,
        preview_url: 'https://media3.giphy.com/media/abc123/200.gif'
      })
    ).toEqual({
      id: 'abc123',
      title: '',
      url: 'https://media3.giphy.com/media/abc123/giphy.gif',
      preview_url: 'https://media3.giphy.com/media/abc123/200.gif',
      width: 480,
      height: 270
    })
  })

  it('sem metadados usa zeros e sem id devolve null', () => {
    expect(gifFromMessage('https://media3.giphy.com/media/a1/giphy.gif')?.width).toBe(0)
    expect(gifFromMessage('https://x.com/a.gif')).toBeNull()
  })
})
