import { useCallNoticeStore } from '../store/callNoticeStore'
import { useCallSessionStore } from '../store/callSessionStore'
import { useIncomingCallStore } from '../store/incomingCallStore'
import { handleCallInviteTap } from './callInviteTap'

const data = { type: 'call_invite', call_id: 'c1', conversation_id: 'cv1', name: 'Ana' }
const ringing = {
  call: { id: 'c1', type: 'dm' as const, conversation_id: 'cv1', initiator_id: 'u1', status: 'ringing' as const },
  participants: [{ user_id: 'u1', username: 'ana', display_name: 'Ana Souza' }]
}

beforeEach(() => {
  useCallSessionStore.getState().reset()
  useIncomingCallStore.getState().clear()
  useCallNoticeStore.getState().dismiss()
})

describe('handleCallInviteTap', () => {
  it('chamada ainda tocando: abre a tela de atender com quem ligou', async () => {
    await handleCallInviteTap(data, { getActiveDmCall: jest.fn().mockResolvedValue(ringing) })
    expect(useIncomingCallStore.getState().call).toEqual({
      callId: 'c1',
      conversationId: 'cv1',
      initiator: { id: 'u1', username: 'ana', display_name: 'Ana Souza', avatar_url: null }
    })
  })

  it('chamada que já acabou: avisa que foi perdida', async () => {
    await handleCallInviteTap(data, { getActiveDmCall: jest.fn().mockResolvedValue({ call: null, participants: [] }) })
    expect(useIncomingCallStore.getState().call).toBeNull()
    expect(useCallNoticeStore.getState().message).toBe('Chamada perdida de Ana')
  })

  it('outra chamada tocando na mesma conversa não é a do push: perdida', async () => {
    await handleCallInviteTap(data, { getActiveDmCall: jest.fn().mockResolvedValue({ ...ringing, call: { ...ringing.call, id: 'outra' } }) })
    expect(useCallNoticeStore.getState().message).toBe('Chamada perdida de Ana')
  })

  it('erro de rede também vira chamada perdida', async () => {
    await handleCallInviteTap(data, { getActiveDmCall: jest.fn().mockRejectedValue(new Error('rede')) })
    expect(useCallNoticeStore.getState().message).toBe('Chamada perdida de Ana')
  })

  it('em call, ainda abre a tela de atender', async () => {
    useCallSessionStore.getState().begin({ callId: 'x', kind: 'channel', phase: 'active', name: 'Geral' })
    await handleCallInviteTap(data, { getActiveDmCall: jest.fn().mockResolvedValue(ringing) })
    expect(useIncomingCallStore.getState().call?.callId).toBe('c1')
  })

  it('dados incompletos são ignorados', async () => {
    const getActiveDmCall = jest.fn()
    await handleCallInviteTap({ type: 'call_invite' }, { getActiveDmCall })
    expect(getActiveDmCall).not.toHaveBeenCalled()
  })
})
