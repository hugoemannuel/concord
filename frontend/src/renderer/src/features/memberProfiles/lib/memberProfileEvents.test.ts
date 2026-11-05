import { describe, expect, it, vi } from 'vitest'
import { handleMemberProfileEvent } from './memberProfileEvents'

const deps = () => ({ apply: vi.fn(), forgetServer: vi.fn() })

describe('handleMemberProfileEvent', () => {
  it('membro atualizado traz o perfil; sem ele, volta ao global', () => {
    const d = deps()
    handleMemberProfileEvent(
      { type: 'server:member:update', payload: { server_id: 's1', member: { user_id: 'a', member_profile: { bio: 'x' } } } },
      d
    )
    expect(d.apply).toHaveBeenCalledWith('s1', 'a', { bio: 'x' })
    handleMemberProfileEvent(
      { type: 'server:member:update', payload: { server_id: 's1', member: { user_id: 'a' } } },
      d
    )
    expect(d.apply).toHaveBeenLastCalledWith('s1', 'a', undefined)
  })

  it('sair do servidor apaga o perfil da pessoa', () => {
    const d = deps()
    handleMemberProfileEvent({ type: 'server:member:leave', payload: { server_id: 's1', user_id: 'a' } }, d)
    expect(d.apply).toHaveBeenCalledWith('s1', 'a', null)
  })

  it('perder o servidor esquece tudo dele', () => {
    const d = deps()
    handleMemberProfileEvent({ type: 'server:removed', payload: { server_id: 's1' } }, d)
    handleMemberProfileEvent({ type: 'server:delete', payload: { server_id: 's2' } }, d)
    expect(d.forgetServer.mock.calls).toEqual([['s1'], ['s2']])
  })

  it('outros eventos e payload incompleto não fazem nada', () => {
    const d = deps()
    handleMemberProfileEvent({ type: 'message:create', payload: { server_id: 's1' } }, d)
    handleMemberProfileEvent({ type: 'server:member:update' }, d)
    handleMemberProfileEvent({ type: 'server:member:update', payload: { server_id: 's1' } }, d)
    handleMemberProfileEvent({ type: 'server:member:leave', payload: { server_id: 's1' } }, d)
    expect(d.apply).not.toHaveBeenCalled()
    expect(d.forgetServer).not.toHaveBeenCalled()
  })
})
