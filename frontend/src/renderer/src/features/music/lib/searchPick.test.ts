import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../shared/api/client'
import { runSearchPick, type SearchPickDeps } from './searchPick'

const deps = (pick: SearchPickDeps['pick']): SearchPickDeps => ({
  pick,
  dismiss: vi.fn(),
  markExpired: vi.fn(),
  error: vi.fn()
})

describe('runSearchPick', () => {
  it('escolheu: some a resposta', async () => {
    const d = deps(vi.fn(async () => {}))
    await runSearchPick(d)
    expect(d.dismiss).toHaveBeenCalled()
    expect(d.error).not.toHaveBeenCalled()
  })

  it('410: a busca expirou, as opções ficam cinzas sem aviso', async () => {
    const d = deps(vi.fn(async () => Promise.reject(new ApiError(410, 'expirou'))))
    await runSearchPick(d)
    expect(d.markExpired).toHaveBeenCalled()
    expect(d.dismiss).not.toHaveBeenCalled()
    expect(d.error).not.toHaveBeenCalled()
  })

  it('outro erro: avisa com a mensagem dele ou o padrão', async () => {
    const d = deps(vi.fn(async () => Promise.reject(new ApiError(500, 'caiu'))))
    await runSearchPick(d)
    expect(d.error).toHaveBeenCalledWith('caiu')
    expect(d.markExpired).not.toHaveBeenCalled()
    const d2 = deps(vi.fn(async () => Promise.reject('x')))
    await runSearchPick(d2)
    expect(d2.error).toHaveBeenCalledWith('Falha na operação.')
  })
})
