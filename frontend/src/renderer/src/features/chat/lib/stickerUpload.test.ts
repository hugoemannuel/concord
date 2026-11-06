import { describe, expect, it } from 'vitest'
import { pickStickerFile } from './stickerUpload'

const image = (name: string, type: string, size = 10): File =>
  new File([new Uint8Array(size)], name, { type })

describe('pickStickerFile', () => {
  it('sem arquivo: nada muda', () => {
    expect(pickStickerFile(undefined, 'gato')).toBeNull()
  })

  it('aceita PNG, WebP e GIF e sugere o nome pelo arquivo (até 32 letras)', () => {
    const file = image('Gato Feliz.png', 'image/png')
    expect(pickStickerFile(file, '')).toEqual({ error: null, file, name: 'Gato Feliz' })
    const longo = image(`${'a'.repeat(40)}.webp`, 'image/webp')
    expect(pickStickerFile(longo, '')!.name).toBe('a'.repeat(32))
    expect(pickStickerFile(image('x.gif', 'image/gif'), '')!.file).not.toBeNull()
  })

  it('mantém o nome que a pessoa já digitou', () => {
    expect(pickStickerFile(image('x.png', 'image/png'), 'risada')!.name).toBe('risada')
  })

  it('recusa arquivo grande ou de outro formato, sem trocar o escolhido', () => {
    expect(pickStickerFile(image('x.png', 'image/png', 1024 * 1024 + 1), 'n')).toEqual({
      error: 'A imagem deve ter no máximo 1 MB.',
      file: null,
      name: 'n'
    })
    expect(pickStickerFile(image('x.jpg', 'image/jpeg'), 'n')).toEqual({
      error: 'Apenas imagens PNG, WebP ou GIF são suportadas.',
      file: null,
      name: 'n'
    })
  })
})
