import { beforeEach, describe, expect, it, vi } from 'vitest'

const reorderChannels = vi.hoisted(() => vi.fn())
const toastError = vi.hoisted(() => vi.fn())
vi.mock('../store/serverStore', () => ({ useServerStore: { getState: () => ({ reorderChannels }) } }))
vi.mock('../../../shared/store/toastStore', () => ({ showToast: { error: toastError } }))
import { saveChannelOrder } from './saveChannelOrder'

describe('saveChannelOrder', () => {
  beforeEach(() => {
    reorderChannels.mockReset()
    toastError.mockReset()
  })
  it('manda a seção na nova ordem', async () => {
    await saveChannelOrder('s', 'voice', ['b', 'a'])
    expect(reorderChannels).toHaveBeenCalledWith('s', 'voice', ['b', 'a'])
    expect(toastError).not.toHaveBeenCalled()
  })
  it('recusado: avisa', async () => {
    reorderChannels.mockRejectedValue(new Error('não'))
    await saveChannelOrder('s', 'text', [])
    expect(toastError).toHaveBeenCalledWith('Não foi possível mudar a ordem dos canais.')
  })
})
