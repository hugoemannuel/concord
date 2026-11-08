import { afterEach, describe, expect, it, vi } from 'vitest'
import { readMediaMeta } from './readMediaMeta'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('readMediaMeta', () => {
  it('arquivo genérico não tem metadados: {} sem criar <video>/<audio> (que esperaria o tempo limite)', async () => {
    const createElement = vi.fn(() => ({ load: vi.fn(), removeAttribute: vi.fn() }))
    vi.stubGlobal('document', { createElement })
    await expect(readMediaMeta(new Blob(['%PDF-1.7']), 'file')).resolves.toEqual({})
    expect(createElement).not.toHaveBeenCalled()
  })

  it('qualquer falha na leitura vira {}', async () => {
    // Sem createImageBitmap (Node): a leitura falha e o upload segue sem metadados.
    await expect(readMediaMeta(new Blob(['x']), 'image')).resolves.toEqual({})
  })
})
