import { describe, expect, it, vi } from 'vitest'
import { handleServerProfileEvent, type ServerProfileEventDeps } from './serverProfileEvents'

function deps(): ServerProfileEventDeps {
  return { setProfile: vi.fn(), refreshServerTag: vi.fn(), setUserTag: vi.fn() }
}

describe('handleServerProfileEvent', () => {
  it('server:profile atualiza o perfil', () => {
    const d = deps()
    const profile = { description: 'oi' }
    handleServerProfileEvent({ type: 'server:profile', payload: { server_id: 's', profile } }, d)
    expect(d.setProfile).toHaveBeenCalledWith('s', profile)
  })
  it('server:tag só diz qual servidor mudou', () => {
    const d = deps()
    handleServerProfileEvent({ type: 'server:tag', payload: { server_id: 's' } }, d)
    expect(d.refreshServerTag).toHaveBeenCalledWith('s')
  })
  it('user:server_tag leva a tag da pessoa e o servidor de onde ela saiu', () => {
    const d = deps()
    handleServerProfileEvent(
      { type: 'user:server_tag', payload: { user_id: 'u', tag: null, left_server_id: 's' } },
      d
    )
    expect(d.setUserTag).toHaveBeenCalledWith('u', null, 's')
  })
  it('ignora o resto e payload sem id', () => {
    const d = deps()
    handleServerProfileEvent({ type: 'outro', payload: {} }, d)
    handleServerProfileEvent({ type: 'server:profile', payload: {} }, d)
    handleServerProfileEvent({ type: 'server:tag', payload: {} }, d)
    handleServerProfileEvent({ type: 'user:server_tag', payload: {} }, d)
    expect(d.setProfile).not.toHaveBeenCalled()
    expect(d.refreshServerTag).not.toHaveBeenCalled()
    expect(d.setUserTag).not.toHaveBeenCalled()
  })
})
