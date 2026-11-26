import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../call/store/callStore', () => ({
  useCallStore: { getState: () => ({ type: null, status: 'idle', endCall: () => {} }) }
}))

import { useUpdateStore } from '../store/updateStore'
import { startRequiredUpdate } from './startRequiredUpdate'

describe('startRequiredUpdate', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    useUpdateStore.setState({ version: null, requested: false })
  })

  it('com versão nova conhecida, só pede a instalação', () => {
    const updates = { install: vi.fn(), checkNow: vi.fn() }
    vi.stubGlobal('window', { api: { updates } })
    useUpdateStore.setState({ version: '1.2.0' })
    startRequiredUpdate()
    vi.runAllTimers()
    expect(updates.install).toHaveBeenCalledOnce()
    expect(updates.checkNow).not.toHaveBeenCalled()
  })

  it('sem versão conhecida, pede a instalação e a checagem (instala quando achar)', () => {
    const updates = { install: vi.fn(), checkNow: vi.fn() }
    vi.stubGlobal('window', { api: { updates } })
    startRequiredUpdate()
    vi.runAllTimers()
    expect(updates.install).toHaveBeenCalledOnce()
    expect(updates.checkNow).toHaveBeenCalledOnce()
    expect(useUpdateStore.getState().requested).toBe(true)
  })
})
