import { describe, expect, it, vi } from 'vitest'
import { handleArrivalEvent, type ArrivalEventDeps } from './arrivalEvents'

const joined = (userId: string, callId = 'call-1'): { type: string; payload: unknown } => ({
  type: 'call:joined',
  payload: { call_id: callId, user: { id: userId } }
})
const left = (userId: string, callId = 'call-1'): { type: string; payload: unknown } => ({
  type: 'call:left',
  payload: { call_id: callId, user: { id: userId } }
})

function deps(over: Partial<ArrivalEventDeps> = {}): ArrivalEventDeps {
  return {
    call: () => ({ callId: 'call-1', type: 'channel', status: 'active', channelId: 'c1' }),
    meId: () => 'eu',
    join: vi.fn(),
    leave: vi.fn(),
    ...over
  }
}

describe('handleArrivalEvent', () => {
  it('alguém entrou na minha call de canal: marca a chegada naquele canal', () => {
    const d = deps()
    handleArrivalEvent(joined('ana'), d)
    expect(d.join).toHaveBeenCalledWith('c1', 'ana', 'eu')
  })

  it('eu mesmo entrando não marca', () => {
    const d = deps()
    handleArrivalEvent(joined('eu'), d)
    expect(d.join).not.toHaveBeenCalled()
  })

  it('call de outra sala ou DM não marca', () => {
    const d = deps()
    handleArrivalEvent(joined('ana', 'outra'), d)
    expect(d.join).not.toHaveBeenCalled()
    const dm = deps({ call: () => ({ callId: 'call-1', type: 'dm', status: 'active', channelId: null }) })
    handleArrivalEvent(joined('ana'), dm)
    expect(dm.join).not.toHaveBeenCalled()
  })

  it('call que ainda não está ativa para mim não marca', () => {
    const d = deps({
      call: () => ({ callId: 'call-1', type: 'channel', status: 'connecting', channelId: 'c1' })
    })
    handleArrivalEvent(joined('ana'), d)
    expect(d.join).not.toHaveBeenCalled()
  })

  it('alguém saiu da minha call: registra a saída', () => {
    const d = deps()
    handleArrivalEvent(left('ana'), d)
    expect(d.leave).toHaveBeenCalledWith('c1', 'ana')
  })

  it('saída de outra call ou outros eventos são ignorados', () => {
    const d = deps()
    handleArrivalEvent(left('ana', 'outra'), d)
    handleArrivalEvent({ type: 'typing', payload: {} }, d)
    handleArrivalEvent({ type: 'call:left', payload: null }, d)
    expect(d.leave).not.toHaveBeenCalled()
  })
})

describe('handleArrivalEvent — lista dos canais do servidor', () => {
  const channelJoined = (userId: string, channelId: string) => ({
    type: 'call:channel_joined',
    payload: { call: { id: 'c9', channel_id: channelId }, participant: { user_id: userId } }
  })
  const channelLeft = (userId: string, channelId: string) => ({
    type: 'call:channel_left',
    payload: { call_id: 'c9', channel_id: channelId, user_id: userId }
  })

  it('alguém entrou num canal em que não estou: marca a chegada nele', () => {
    const d = deps({ call: () => ({ callId: null, type: null, status: 'idle', channelId: null }) })
    handleArrivalEvent(channelJoined('ana', 'v2'), d)
    expect(d.join).toHaveBeenCalledWith('v2', 'ana', 'eu')
  })

  it('alguém saiu de um canal: registra a saída nele', () => {
    const d = deps({ call: () => ({ callId: null, type: null, status: 'idle', channelId: null }) })
    handleArrivalEvent(channelLeft('ana', 'v2'), d)
    expect(d.leave).toHaveBeenCalledWith('v2', 'ana')
  })

  it('evento sem canal é ignorado', () => {
    const d = deps()
    handleArrivalEvent({ type: 'call:channel_joined', payload: { call: {}, participant: {} } }, d)
    handleArrivalEvent({ type: 'call:channel_left', payload: null }, d)
    expect(d.join).not.toHaveBeenCalled()
    expect(d.leave).not.toHaveBeenCalled()
  })
})
