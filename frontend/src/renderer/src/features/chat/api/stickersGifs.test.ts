import { describe, expect, it, vi, beforeEach } from 'vitest'
import { stickerFileUrl, MAX_STICKER_BYTES, MAX_STICKER_NAME_LEN } from './stickers'

describe('stickers API helpers', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('monta a URL correta do arquivo de figurinha com token', () => {
    const url = stickerFileUrl('stk-123', 'tok-abc')
    expect(url).toContain('/stickers/stk-123/file?token=tok-abc')
  })

  it('monta a URL do arquivo de figurinha sem token', () => {
    const url = stickerFileUrl('stk-456')
    expect(url).toContain('/stickers/stk-456/file')
    expect(url).not.toContain('?token=')
  })

  it('tem limites de figurinha corretos (1 MB e 32 caracteres)', () => {
    expect(MAX_STICKER_BYTES).toBe(1024 * 1024)
    expect(MAX_STICKER_NAME_LEN).toBe(32)
  })
})
