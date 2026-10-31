import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  listener: null as ((e: { type: string; payload: unknown }) => void) | null,
  end: vi.fn(),
  info: vi.fn()
}))
vi.mock('../../../shared/api/ws', () => ({
  onWsEvent: (fn: (e: { type: string; payload: unknown }) => void) => {
    h.listener = fn
    return () => {}
  }
}))
vi.mock('../../profile/store/meActions', () => ({ endLocalSession: h.end }))
vi.mock('../../../shared/store/toastStore', () => ({ showToast: { info: h.info } }))

import { startSessionRevoked } from './sessionRevokedStart'

describe('startSessionRevoked', () => {
  beforeEach(() => {
    h.end.mockReset()
    h.info.mockReset()
  })

  it('sessão encerrada pelo servidor: avisa e volta ao login', () => {
    startSessionRevoked()
    h.listener?.({ type: 'session:revoked', payload: null })
    expect(h.end).toHaveBeenCalledTimes(1)
    expect(h.info).toHaveBeenCalledWith('Sua sessão foi encerrada. Entre de novo.')
  })

  it('outros eventos não mexem na sessão', () => {
    startSessionRevoked()
    h.listener?.({ type: 'message:create', payload: {} })
    expect(h.end).not.toHaveBeenCalled()
  })
})
