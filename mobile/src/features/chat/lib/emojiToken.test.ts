import { emojiFileUrl, splitCustomEmojis } from './emojiToken'

const ID = '3f2b6c1e-8a4d-4f7e-9b1a-2c3d4e5f6a7b'

describe('splitCustomEmojis', () => {
  it('sem emoji devolve o texto', () => {
    expect(splitCustomEmojis('oi <: tudo')).toEqual([{ text: 'oi <: tudo' }])
  })

  it('separa o emoji do texto em volta', () => {
    expect(splitCustomEmojis(`oi <:festa:${ID}> tchau`)).toEqual([
      { text: 'oi ' },
      { text: `<:festa:${ID}>`, emoji: { name: 'festa', id: ID } },
      { text: ' tchau' }
    ])
  })

  it('token malformado continua texto', () => {
    expect(splitCustomEmojis('<:festa:nao-e-uuid>')).toEqual([{ text: '<:festa:nao-e-uuid>' }])
  })
})

describe('emojiFileUrl', () => {
  it('leva o token de mídia', () => {
    expect(emojiFileUrl('https://x/api', ID, 'a b')).toBe(`https://x/api/emojis/${ID}/file?token=a%20b`)
  })
})
