import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Message } from '../../api/messages'
import type { ChatState } from '../chatStore'
import type { ChatWsContext } from './context'

const stickers = vi.hoisted(() => ({ handleWsEvent: vi.fn(() => true) }))
vi.mock('../stickerStore', () => ({ useStickerStore: { getState: () => stickers } }))

const { handleStickerEvent, withoutSticker } = await import('./stickers')

const msg = (id: string, extra: Partial<Message> = {}): Message => ({ id, ...extra }) as Message

function fakeCtx(messagesByRoom: ChatState['messagesByRoom']): {
  ctx: ChatWsContext
  state: () => ChatState
} {
  let state = { messagesByRoom } as ChatState
  const ctx = {
    set: (next) => {
      state = { ...state, ...next(state) }
    },
    get: () => state
  } as ChatWsContext
  return { ctx, state: () => state }
}

beforeEach(() => stickers.handleWsEvent.mockReturnValue(true))

describe('withoutSticker', () => {
  it('a figurinha apagada deixa o nome na mensagem, para mostrar :nome:', () => {
    const sticker = { id: 'stk', server_id: 's', name: 'gato', content_type: 'image/png' }
    const next = withoutSticker({ 'channel:c': [{ id: 'm', sticker_id: 'stk', sticker } as Message] }, 'stk')
    expect(next?.['channel:c'][0]).toMatchObject({ sticker: null, sticker_id: null, deleted_sticker_name: 'gato' })
  })

  it('tira a figurinha (pelo id ou pelo objeto) e mantém as salas sem ela', () => {
    const other = [msg('c')]
    const next = withoutSticker(
      {
        a: [
          msg('1', { sticker_id: 'st' }),
          msg('2', { sticker: { id: 'st' } } as Partial<Message>)
        ],
        b: other
      },
      'st'
    )
    expect(next?.a.map((m) => [m.sticker_id, m.sticker])).toEqual([
      [null, null],
      [null, null]
    ])
    expect(next?.b).toBe(other)
  })

  it('nenhuma mensagem usa: null', () => {
    expect(withoutSticker({ a: [msg('1')] }, 'st')).toBeNull()
  })
})

describe('handleStickerEvent', () => {
  it('não é de figurinha: false', () => {
    stickers.handleWsEvent.mockReturnValue(false)
    const { ctx } = fakeCtx({})
    expect(handleStickerEvent({ type: 'x', payload: {} }, ctx)).toBe(false)
  })

  it('sticker:deleted tira a figurinha das mensagens carregadas', () => {
    const { ctx, state } = fakeCtx({ a: [msg('1', { sticker_id: 'st' })] })
    expect(
      handleStickerEvent({ type: 'sticker:deleted', payload: { sticker_id: 'st' } }, ctx)
    ).toBe(true)
    expect(state().messagesByRoom.a[0].sticker_id).toBeNull()
  })

  it('sticker:deleted sem uso e sticker:created não mexem nas mensagens', () => {
    const rooms = { a: [msg('1')] }
    const { ctx, state } = fakeCtx(rooms)
    handleStickerEvent({ type: 'sticker:deleted', payload: { sticker_id: 'st' } }, ctx)
    handleStickerEvent({ type: 'sticker:created', payload: {} }, ctx)
    expect(state().messagesByRoom).toBe(rooms)
  })
})
