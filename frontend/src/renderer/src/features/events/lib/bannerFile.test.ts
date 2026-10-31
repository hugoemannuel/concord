import { describe, expect, it } from 'vitest'
import { MAX_BANNER_BYTES } from '../api/events'
import { bannerFileError } from './bannerFile'

const file = (type: string, size: number): { type: string; size: number } => ({ type, size })

describe('bannerFileError', () => {
  it('aceita PNG, JPEG e WEBP até 10 MB', () => {
    expect(bannerFileError(file('image/png', 1000))).toBeNull()
    expect(bannerFileError(file('image/jpeg', 1000))).toBeNull()
    expect(bannerFileError(file('image/webp', MAX_BANNER_BYTES))).toBeNull()
  })

  it('recusa GIF, AVIF e arquivo que não é imagem', () => {
    const message = 'Use uma imagem PNG, JPEG ou WEBP.'
    expect(bannerFileError(file('image/gif', 1000))).toBe(message)
    expect(bannerFileError(file('image/avif', 1000))).toBe(message)
    expect(bannerFileError(file('application/pdf', 1000))).toBe(message)
    expect(bannerFileError(file('', 1000))).toBe(message)
  })

  it('recusa imagem acima de 10 MB', () => {
    expect(bannerFileError(file('image/png', MAX_BANNER_BYTES + 1))).toBe('A imagem pode ter até 10 MB.')
  })

  it('recusa arquivo vazio', () => {
    expect(bannerFileError(file('image/png', 0))).toBe('A imagem está vazia.')
  })
})
