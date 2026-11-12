import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Message } from '../../api/messages'
import type { ChatState } from '../chatStore'
import type { ChatWsContext } from './context'

const pins = vi.hoisted(() => ({
  onMessageUpdate: vi.fn(),
  onMessageDelete: vi.fn(),
  onPinAdd: vi.fn(),
  onPinRemove: vi.fn()
}))
vi.mock('../pinStore', () => ({ usePinStore: { getState: () => pins } }))
vi.mock('../../../auth/store/authStore', () => ({
  useAuthStore: { getState: () => ({ user: { id: 'me' } }) }
}))

const { MESSAGE_HANDLERS, reactionOf, withDeletedMessage } = await import('./messages')

const msg = (id: string, extra: Partial<Message> = {}): Message =>
  ({ id, author_id: 'ana', channel_id: 'c1', content: id, created_at: '', ...extra }) as Message

function fakeCtx(initial: Partial<ChatState>): { ctx: ChatWsContext; state: () => ChatState } {
  let state = {
    messagesByRoom: {},
    unreadByRoom: {},
    unreadByServer: {},
    conversations: [],
    ...initial
  } as unknown as ChatState
  const ctx = {
    set: (next) => {
      state = { ...state, ...next(state) }
    },
    get: () => state
  } as ChatWsContext
  return { ctx, state: () => state }
}

const send = (type: string, payload: Record<string, unknown>, ctx: ChatWsContext): void =>
  MESSAGE_HANDLERS[type](payload, ctx, { type, payload })

beforeEach(() => vi.clearAllMocks())

describe('withDeletedMessage', () => {
  const base = {
    messagesByRoom: {
      'channel:c1': [msg('a'), msg('b', { reply_to_id: 'a', reply_to: msg('a') })]
    },
    unreadByRoom: { 'channel:c1': 2 },
    unreadByServer: { s1: 1 }
  } as unknown as ChatState

  it('tira a mensagem, a citação dela e desconta as não lidas', () => {
    const next = withDeletedMessage(base, {
      room: 'channel:c1',
      messageId: 'a',
      channelId: 'c1',
      serverId: 's1'
    })
    expect(next.messagesByRoom?.['channel:c1'].map((m) => [m.id, m.reply_to])).toEqual([
      ['b', null]
    ])
    expect(next.unreadByRoom).toEqual({ 'channel:c1': 1 })
    expect(next.unreadByServer).toEqual({ s1: 0 })
  })

  it('não desconta abaixo de zero nem o servidor numa DM', () => {
    const state = { ...base, unreadByRoom: {} } as ChatState
    const next = withDeletedMessage(state, {
      room: 'conversation:d1',
      messageId: 'x',
      serverId: 's1'
    })
    expect(next.unreadByRoom).toBe(state.unreadByRoom)
    expect(next.unreadByServer).toBe(state.unreadByServer)
    expect(next.messagesByRoom?.['conversation:d1']).toEqual([])
  })

  it('apagada pelo prazo (expired) sai da sala sem descontar não lidas', () => {
    const state = {
      ...base,
      messagesByRoom: { 'conversation:d1': [msg('x')] },
      unreadByRoom: { 'conversation:d1': 3 }
    } as unknown as ChatState
    const next = withDeletedMessage(state, {
      room: 'conversation:d1',
      messageId: 'x',
      serverId: null,
      expired: true
    })
    expect(next.messagesByRoom?.['conversation:d1']).toEqual([])
    // o parcial não toca nas não lidas
    expect(next.unreadByRoom).toBeUndefined()
    expect(next.unreadByServer).toBeUndefined()
  })
})

describe('eventos de mensagem', () => {
  it('message:delete avisa os fixados e limpa a sala', () => {
    const { ctx, state } = fakeCtx({ messagesByRoom: { 'channel:c1': [msg('a')] } })
    send('message:delete', { message_id: 'a', channel_id: 'c1', server_id: 's1' }, ctx)
    expect(pins.onMessageDelete).toHaveBeenCalledWith('a')
    expect(state().messagesByRoom['channel:c1']).toEqual([])
  })

  it('message:delete com expired não mexe nas não lidas da DM', () => {
    const { ctx, state } = fakeCtx({ unreadByRoom: { 'conversation:d1': 2 } })
    send('message:delete', { message_id: 'x', conversation_id: 'd1', expired: true }, ctx)
    expect(state().unreadByRoom).toEqual({ 'conversation:d1': 2 })
    send('message:delete', { message_id: 'y', conversation_id: 'd1' }, ctx)
    expect(state().unreadByRoom).toEqual({ 'conversation:d1': 1 })
  })

  it('message:delete da última mensagem da DM recarrega a lista de conversas', () => {
    const fetchConversations = vi.fn()
    const { ctx } = fakeCtx({
      conversations: [{ id: 'd1', last_message: { id: 'x' } }],
      fetchConversations
    } as unknown as Partial<ChatState>)
    send('message:delete', { message_id: 'velha', conversation_id: 'd1', expired: true }, ctx)
    expect(fetchConversations).not.toHaveBeenCalled()
    send('message:delete', { message_id: 'x', conversation_id: 'd1', expired: true }, ctx)
    expect(fetchConversations).toHaveBeenCalledTimes(1)
  })

  it('message:update sem id não faz nada', () => {
    const { ctx } = fakeCtx({})
    send('message:update', { message: {} }, ctx)
    expect(pins.onMessageUpdate).not.toHaveBeenCalled()
  })

  it('channel:pin:add e :remove marcam e desmarcam a mensagem', () => {
    const { ctx, state } = fakeCtx({ messagesByRoom: { 'channel:c1': [msg('a'), msg('b')] } })
    const pin = { ...msg('a'), pinned_at: '2026-10-28' }
    send('channel:pin:add', { channel_id: 'c1', message: pin }, ctx)
    expect(pins.onPinAdd).toHaveBeenCalledWith('c1', pin)
    expect(state().messagesByRoom['channel:c1'].map((m) => m.pinned_at)).toEqual([
      '2026-10-28',
      undefined
    ])
    send('channel:pin:remove', { channel_id: 'c1', message_id: 'a' }, ctx)
    expect(pins.onPinRemove).toHaveBeenCalledWith('c1', 'a')
    expect(state().messagesByRoom['channel:c1'][0].pinned_at).toBeNull()
  })

  it('pin sem canal ou mensagem é ignorado', () => {
    const { ctx } = fakeCtx({})
    send('channel:pin:add', { channel_id: 'c1' }, ctx)
    send('channel:pin:remove', { message_id: 'a' }, ctx)
    expect(pins.onPinAdd).not.toHaveBeenCalled()
    expect(pins.onPinRemove).not.toHaveBeenCalled()
  })

  it('message:reaction:remove tira a reação da pessoa', () => {
    const reacted = msg('a', {
      reactions: [{ emoji: '👍', count: 1, user_ids: ['ana'] }]
    } as Partial<Message>)
    const { ctx, state } = fakeCtx({ messagesByRoom: { 'channel:c1': [reacted] } })
    send(
      'message:reaction:remove',
      { message_id: 'a', user_id: 'ana', emoji: '👍', channel_id: 'c1' },
      ctx
    )
    expect(state().messagesByRoom['channel:c1'][0].reactions ?? []).toEqual([])
  })
})

describe('reactionOf', () => {
  const ok = { message_id: 'a', user_id: 'u', emoji: '👍', conversation_id: 'd1' }

  it('monta a reação com a sala', () => {
    expect(reactionOf(ok)).toEqual({
      room: 'conversation:d1',
      messageId: 'a',
      userId: 'u',
      emoji: '👍'
    })
  })

  it.each(['message_id', 'user_id', 'emoji'])('sem %s: null', (field) => {
    expect(reactionOf({ ...ok, [field]: '' })).toBeNull()
  })

  it('sem sala: null', () => {
    expect(reactionOf({ ...ok, conversation_id: '' })).toBeNull()
  })
})
