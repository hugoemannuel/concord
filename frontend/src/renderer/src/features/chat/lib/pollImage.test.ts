import { describe, expect, it } from 'vitest'
import { pollImageSrc } from './pollImage'

const ID = '0b6f9c1e-2a3b-4c5d-8e9f-0a1b2c3d4e5f'

describe('pollImageSrc', () => {
  it('soma a origem da API à cópia guardada no servidor', () => {
    expect(pollImageSrc(`/api/poll-images/${ID}`, 'https://salinha.app/api')).toBe(`https://salinha.app/api/poll-images/${ID}`)
    expect(pollImageSrc(`/api/poll-images/${ID}`, '/api')).toBe(`/api/poll-images/${ID}`)
  })

  // Regressão: a imagem de fora era carregada por todo mundo que via a enquete
  // (o site recebia o IP de cada um). Enquete antiga com URL de fora fica sem imagem.
  it('não carrega imagem de fora nem outro caminho', () => {
    for (const url of ['https://rastreio.com/pixel.png', 'http://x.com/a.png', '/api/profile-media/x', `//evil.com/api/poll-images/${ID}`, '', null, undefined]) {
      expect(pollImageSrc(url, 'https://salinha.app/api')).toBeNull()
    }
  })
})
