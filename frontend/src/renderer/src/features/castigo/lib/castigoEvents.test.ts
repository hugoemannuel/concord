import { describe, expect, it, vi } from 'vitest'
import { handleCastigoEvent } from './castigoEvents'

describe('handleCastigoEvent', () => {
  const deps = () => ({ upsert: vi.fn(), setVote: vi.fn() })

  it('castigo:update vai para o store', () => {
    const d = deps()
    const c = {
      server_id: 's',
      user_id: 'u',
      speak_until: null,
      connect_until: null,
      listen_until: null
    }
    handleCastigoEvent({ type: 'castigo:update', payload: c }, d)
    expect(d.upsert).toHaveBeenCalledWith(c)
  })

  it('castigo:vote vai para o store', () => {
    const d = deps()
    handleCastigoEvent({ type: 'castigo:vote', payload: { id: 'v', call_id: 'c' } }, d)
    expect(d.setVote).toHaveBeenCalledWith({ id: 'v', call_id: 'c' })
  })

  it('ignora o resto e payload incompleto', () => {
    const d = deps()
    handleCastigoEvent({ type: 'castigo:update', payload: { server_id: 's' } }, d)
    handleCastigoEvent({ type: 'castigo:vote', payload: null }, d)
    handleCastigoEvent({ type: 'message:create', payload: { id: 'x', call_id: 'c' } }, d)
    expect(d.upsert).not.toHaveBeenCalled()
    expect(d.setVote).not.toHaveBeenCalled()
  })
})
