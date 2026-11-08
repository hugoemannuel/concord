import { describe, expect, it } from 'vitest'
import { MAX_PREVIEWS, previewLinks } from './previewLinks'

describe('previewLinks', () => {
  it('pega os links da mensagem, na ordem e sem repetir', () => {
    expect(previewLinks('olha https://www.buser.com.br/ e www.exemplo.com, e https://www.buser.com.br/')).toEqual([
      'https://www.buser.com.br/',
      'https://www.exemplo.com'
    ])
  })

  it(`no máximo ${MAX_PREVIEWS} por mensagem (os primeiros)`, () => {
    const text = ['a', 'b', 'c', 'd'].map((s) => `https://${s}.com`).join(' ')
    expect(previewLinks(text)).toEqual(['https://a.com', 'https://b.com', 'https://c.com'])
  })

  it('<url> não ganha prévia (como no Discord)', () => {
    expect(previewLinks('sem cartão <https://a.com/x> mas com https://b.com')).toEqual(['https://b.com'])
  })

  it('link dentro de código não ganha prévia', () => {
    expect(previewLinks('rode `curl https://a.com` e veja https://b.com')).toEqual(['https://b.com'])
    expect(previewLinks('```\nhttps://a.com\n```\nhttps://c.com')).toEqual(['https://c.com'])
    expect(previewLinks('```js\nfetch("https://a.com")```')).toEqual([])
  })

  it('crase sem par não esconde o resto', () => {
    expect(previewLinks('it`s https://a.com')).toEqual(['https://a.com'])
  })

  it('convite da própria Salinha não ganha prévia (já tem o cartão do servidor)', () => {
    expect(previewLinks('entra https://app-salinha.bhrx.com.br/convite/abcd1234 e https://b.com')).toEqual([
      'https://b.com'
    ])
    expect(previewLinks('https://74-0-5-252.sslip.io/convite/XYZ9', ['https://74-0-5-252.sslip.io'])).toEqual([])
  })

  it('texto sem link', () => {
    expect(previewLinks('')).toEqual([])
    expect(previewLinks('oi tudo bem?')).toEqual([])
  })
})
