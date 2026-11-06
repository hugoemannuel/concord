import { afterEach, describe, expect, it, vi } from 'vitest'
import { bindObjectUrl } from './useObjectUrl'

describe('bindObjectUrl (o efeito do useObjectUrl)', () => {
  afterEach(() => vi.restoreAllMocks())

  it('cria a URL do arquivo e a libera na limpeza (troca de arquivo ou desmontar)', () => {
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:1')
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const set = vi.fn()
    const file = new Blob(['x'])

    const cleanup = bindObjectUrl(file, set)
    expect(create).toHaveBeenCalledWith(file)
    expect(set).toHaveBeenCalledWith('blob:1')
    expect(revoke).not.toHaveBeenCalled()

    cleanup?.()
    expect(revoke).toHaveBeenCalledWith('blob:1')
  })

  it('sem arquivo: sem URL e nada a liberar', () => {
    const create = vi.spyOn(URL, 'createObjectURL')
    const set = vi.fn()
    expect(bindObjectUrl(null, set)).toBeUndefined()
    expect(set).toHaveBeenCalledWith(null)
    expect(create).not.toHaveBeenCalled()
  })
})
