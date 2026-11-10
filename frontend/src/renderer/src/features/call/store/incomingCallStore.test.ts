import { beforeEach, describe, expect, it } from 'vitest'
import { useIncomingCallStore } from './incomingCallStore'

const ana = { id: 'ana', username: 'ana', display_name: 'Ana' }
const caio = { id: 'caio', username: 'caio', display_name: 'Caio' }

describe('incomingCallStore', () => {
  beforeEach(() => useIncomingCallStore.getState().clear())

  it('guarda a chamada que toca', () => {
    useIncomingCallStore.getState().ring({ callId: 'dm-1', conversationId: 'cv-1', initiator: ana })
    expect(useIncomingCallStore.getState().call).toEqual({
      callId: 'dm-1',
      conversationId: 'cv-1',
      initiator: ana
    })
  })

  it('uma segunda chamada não toma o lugar da que já toca', () => {
    useIncomingCallStore.getState().ring({ callId: 'dm-1', conversationId: 'cv-1', initiator: ana })
    useIncomingCallStore
      .getState()
      .ring({ callId: 'dm-2', conversationId: 'cv-2', initiator: caio })
    expect(useIncomingCallStore.getState().call?.callId).toBe('dm-1')
  })

  it('clear zera', () => {
    useIncomingCallStore.getState().ring({ callId: 'dm-1', conversationId: null, initiator: ana })
    useIncomingCallStore.getState().clear()
    expect(useIncomingCallStore.getState().call).toBeNull()
  })
})
