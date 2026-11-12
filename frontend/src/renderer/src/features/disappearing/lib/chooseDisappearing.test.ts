import { describe, expect, it, vi } from 'vitest'
import { chooseDisappearing } from './chooseDisappearing'

describe('chooseDisappearing', () => {
  it('escolher "7 dias" chama setDisappearing(id, 604800)', async () => {
    const set = vi.fn().mockResolvedValue(undefined)
    await chooseDisappearing({ set, onError: vi.fn() }, 'c1', null, 604800)
    expect(set).toHaveBeenCalledWith('c1', 604800)
  })

  it('a opção que já está marcada não chama o servidor', async () => {
    const set = vi.fn()
    await chooseDisappearing({ set, onError: vi.fn() }, 'c1', 604800, 604800)
    expect(set).not.toHaveBeenCalled()
  })

  it('falha vira onError com a mensagem do erro', async () => {
    const onError = vi.fn()
    const set = vi.fn().mockRejectedValue(new Error('Sem conexão com o servidor'))
    await chooseDisappearing({ set, onError }, 'c1', null, 86400)
    expect(onError).toHaveBeenCalledWith('Sem conexão com o servidor')
  })
})
