import { act, renderHook, waitFor } from '@testing-library/react-native'
import { ApiError } from '../../../shared/api/client'
import { realtime } from '../../../shared/api/realtime'
import type { WsEvent } from '../../../shared/api/ws'
import { markConversationRead } from '../api/conversations'
import {
  listChannelMessages,
  listConversationMessages,
  sendChannelMessage,
  sendConversationMessage,
  type Message
} from '../api/messages'
import { useRoomMessages } from './useRoomMessages'

jest.mock('../api/messages', () => ({
  ...jest.requireActual('../api/messages'),
  listChannelMessages: jest.fn(),
  sendChannelMessage: jest.fn(),
  listConversationMessages: jest.fn(),
  sendConversationMessage: jest.fn()
}))
jest.mock('../api/conversations', () => ({ markConversationRead: jest.fn().mockResolvedValue(undefined) }))
jest.mock('../../../shared/api/realtime', () => {
  let reconnect: () => void = () => {}
  return {
    realtime: { subscribe: jest.fn(), unsubscribe: jest.fn() },
    onRealtimeReconnect: jest.fn((l: () => void) => ((reconnect = l), () => {})),
    __reconnect: () => reconnect()
  }
})
let wsHandler: (event: WsEvent) => void = () => {}
jest.mock('../../../shared/api/ws', () => ({
  onWsEvent: jest.fn((l: (e: WsEvent) => void) => ((wsHandler = l), () => {}))
}))

const list = jest.mocked(listChannelMessages)
const send = jest.mocked(sendChannelMessage)
const { __reconnect } = jest.requireMock('../../../shared/api/realtime') as { __reconnect: () => void }

const msg = (id: string, minute: number, channel = 'c1'): Message => ({
  id,
  author_id: 'u1',
  channel_id: channel,
  content: id,
  created_at: `2026-10-28T10:${String(minute).padStart(2, '0')}:00Z`
})
const ids = (messages: Message[]) => messages.map((m) => m.id)
const emit = (type: string, payload: unknown) => act(async () => wsHandler({ type, payload }))

beforeEach(() => {
  jest.clearAllMocks()
  list.mockResolvedValue([msg('b', 2), msg('a', 1)])
})

describe('useRoomMessages', () => {
  it('carrega o histórico e assina a sala do canal', async () => {
    const { result } = await renderHook(() => useRoomMessages({ kind: 'channel', id: 'c1' }))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(ids(result.current.messages)).toEqual(['b', 'a'])
    expect(list).toHaveBeenCalledWith('c1')
    expect(realtime.subscribe).toHaveBeenCalledWith('channel:c1')
  })

  it('ao sair, cancela a assinatura da sala', async () => {
    const { unmount } = await renderHook(() => useRoomMessages({ kind: 'channel', id: 'c1' }))
    await unmount()
    expect(realtime.unsubscribe).toHaveBeenCalledWith('channel:c1')
  })

  it('falha ao carregar: status erro; retry tenta de novo', async () => {
    list.mockRejectedValueOnce(new Error('rede'))
    const { result } = await renderHook(() => useRoomMessages({ kind: 'channel', id: 'c1' }))
    await waitFor(() => expect(result.current.status).toBe('error'))
    await act(async () => result.current.retry())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(ids(result.current.messages)).toEqual(['b', 'a'])
  })

  it('mensagem nova do WebSocket entra no topo; a de outro canal é ignorada', async () => {
    const { result } = await renderHook(() => useRoomMessages({ kind: 'channel', id: 'c1' }))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    await emit('message:create', { message: msg('c', 3) })
    await emit('message:create', { message: msg('z', 4, 'outro') })
    expect(ids(result.current.messages)).toEqual(['c', 'b', 'a'])
  })

  it('message:update troca o texto e message:delete remove', async () => {
    const { result } = await renderHook(() => useRoomMessages({ kind: 'channel', id: 'c1' }))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    await emit('message:update', { message: { ...msg('a', 1), content: 'editada' } })
    expect(result.current.messages.find((m) => m.id === 'a')?.content).toBe('editada')
    await emit('message:delete', { message_id: 'b', channel_id: 'c1' })
    expect(ids(result.current.messages)).toEqual(['a'])
    await emit('message:delete', { message_id: 'a', channel_id: 'outro' })
    expect(ids(result.current.messages)).toEqual(['a'])
  })

  it('loadMore pede a página anterior pelo cursor e some o "tem mais" quando a página vem curta', async () => {
    list.mockResolvedValueOnce(Array.from({ length: 50 }, (_, i) => msg(`m${String(i).padStart(2, '0')}`, i)))
    const { result } = await renderHook(() => useRoomMessages({ kind: 'channel', id: 'c1' }))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.hasMore).toBe(true)
    list.mockResolvedValueOnce([{ ...msg('old', 0), created_at: '2026-10-27T09:00:00Z' }])
    await act(async () => result.current.loadMore())
    expect(list).toHaveBeenLastCalledWith('c1', 'm00')
    expect(result.current.hasMore).toBe(false)
    expect(result.current.messages).toHaveLength(51)
  })

  // Bug do APK de prod: "/play ..." volta 202 {"command": true} (o Maestro trata o comando), não uma mensagem.
  it('enviar um comando do bot (202 {command:true}) não entra na lista nem derruba o chat', async () => {
    send.mockResolvedValue({ command: true })
    const { result } = await renderHook(() => useRoomMessages({ kind: 'channel', id: 'c1' }))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    const before = result.current.messages.length
    let outcome: unknown = ''
    await act(async () => void (outcome = await result.current.send('/play boa noite')))
    expect(outcome).toBe('ok')
    expect(result.current.messages).toHaveLength(before)
  })

  it('enviar GIF/figurinha sem texto vai com os extras; sem texto e sem extras é vazio', async () => {
    send.mockResolvedValue(msg('g', 6))
    const { result } = await renderHook(() => useRoomMessages({ kind: 'channel', id: 'c1' }))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    let outcome: unknown = ''
    await act(async () => void (outcome = await result.current.send('  ')))
    expect(outcome).toBe('empty')
    await act(async () => void (outcome = await result.current.send('', { stickerId: 's1' })))
    expect(outcome).toBe('ok')
    expect(send).toHaveBeenCalledWith('c1', '', { stickerId: 's1' })
  })

  it('enviar: a resposta entra na lista e o evento do WS não duplica', async () => {
    send.mockResolvedValue(msg('n', 5))
    const { result } = await renderHook(() => useRoomMessages({ kind: 'channel', id: 'c1' }))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    let outcome: unknown = ''
    await act(async () => void (outcome = await result.current.send('  oi  ')))
    expect(send).toHaveBeenCalledWith('c1', 'oi', undefined)
    expect(outcome).toBe('ok')
    await emit('message:create', { message: msg('n', 5) })
    expect(ids(result.current.messages)).toEqual(['n', 'b', 'a'])
  })

  it('texto vazio não envia', async () => {
    const { result } = await renderHook(() => useRoomMessages({ kind: 'channel', id: 'c1' }))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    let outcome: unknown = ''
    await act(async () => void (outcome = await result.current.send('   ')))
    expect(outcome).toBe('empty')
    expect(send).not.toHaveBeenCalled()
  })

  it('403 vira "forbidden"; outro erro vira "error"', async () => {
    const { result } = await renderHook(() => useRoomMessages({ kind: 'channel', id: 'c1' }))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    send.mockRejectedValueOnce(new ApiError(403, 'no'))
    let outcome: unknown = ''
    await act(async () => void (outcome = await result.current.send('oi')))
    expect(outcome).toBe('forbidden')
    send.mockRejectedValueOnce(new ApiError(0, 'rede'))
    await act(async () => void (outcome = await result.current.send('oi')))
    expect(outcome).toBe('error')
  })

  it('429 do modo lento traz a espera', async () => {
    const { result } = await renderHook(() => useRoomMessages({ kind: 'channel', id: 'c1' }))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    send.mockRejectedValueOnce(new ApiError(429, 'slow', 'slowmode', { retry_after: 9 }))
    let outcome: unknown = null
    await act(async () => void (outcome = await result.current.send('oi')))
    expect(outcome).toEqual({ slowmode: 9 })
  })

  it('ao reconectar, busca de novo a página mais recente e junta (cobre eventos perdidos)', async () => {
    const { result } = await renderHook(() => useRoomMessages({ kind: 'channel', id: 'c1' }))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    list.mockResolvedValueOnce([msg('perdida', 9)])
    await act(async () => __reconnect())
    await waitFor(() => expect(ids(result.current.messages)).toEqual(['perdida', 'b', 'a']))
  })

  it('trocar de canal descarta a resposta atrasada do canal anterior', async () => {
    let finishFirst: (m: Message[]) => void = () => {}
    list.mockReturnValueOnce(new Promise((r) => (finishFirst = r)))
    list.mockResolvedValueOnce([msg('d', 7, 'c2')])
    const { result, rerender } = await renderHook<ReturnType<typeof useRoomMessages>, { id: string }>(({ id }) => useRoomMessages({ kind: 'channel', id }), {
      initialProps: { id: 'c1' }
    })
    await rerender({ id: 'c2' })
    await waitFor(() => expect(ids(result.current.messages)).toEqual(['d']))
    await act(async () => finishFirst([msg('velha', 1)]))
    expect(ids(result.current.messages)).toEqual(['d'])
  })
})

describe('useRoomMessages: conversa (DM)', () => {
  const listDm = jest.mocked(listConversationMessages)
  const sendDm = jest.mocked(sendConversationMessage)
  const dmMsg = (id: string, minute: number, conversation = 'd1'): Message => ({
    id,
    author_id: 'u2',
    conversation_id: conversation,
    content: id,
    created_at: `2026-10-28T10:${String(minute).padStart(2, '0')}:00Z`
  })
  const open = () => renderHook(() => useRoomMessages({ kind: 'conversation', id: 'd1' }))

  beforeEach(() => {
    listDm.mockResolvedValue([dmMsg('b', 2), dmMsg('a', 1)])
    jest.mocked(markConversationRead).mockClear()
  })

  it('carrega pelo endpoint da conversa e assina a sala conversation:<id>', async () => {
    const { result } = await open()
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(listDm).toHaveBeenCalledWith('d1')
    expect(list).not.toHaveBeenCalled()
    expect(ids(result.current.messages)).toEqual(['b', 'a'])
    expect(realtime.subscribe).toHaveBeenCalledWith('conversation:d1')
  })

  it('ao abrir, marca a conversa como lida', async () => {
    await open()
    await waitFor(() => expect(markConversationRead).toHaveBeenCalledWith('d1'))
  })

  it('mensagem nova desta conversa entra e é marcada como lida; a de outra é ignorada', async () => {
    const { result } = await open()
    await waitFor(() => expect(result.current.status).toBe('ready'))
    jest.mocked(markConversationRead).mockClear()
    await emit('message:create', { message: dmMsg('c', 3) })
    await emit('message:create', { message: dmMsg('z', 4, 'outra') })
    expect(ids(result.current.messages)).toEqual(['c', 'b', 'a'])
    expect(markConversationRead).toHaveBeenCalledTimes(1)
  })

  it('message:delete filtra por conversation_id', async () => {
    const { result } = await open()
    await waitFor(() => expect(result.current.status).toBe('ready'))
    await emit('message:delete', { message_id: 'b', conversation_id: 'd1' })
    expect(ids(result.current.messages)).toEqual(['a'])
    await emit('message:delete', { message_id: 'a', conversation_id: 'outra' })
    expect(ids(result.current.messages)).toEqual(['a'])
  })

  it('enviar usa o endpoint da conversa', async () => {
    sendDm.mockResolvedValue(dmMsg('n', 5))
    const { result } = await open()
    await waitFor(() => expect(result.current.status).toBe('ready'))
    await act(async () => void (await result.current.send('oi')))
    expect(sendDm).toHaveBeenCalledWith('d1', 'oi', undefined)
    expect(send).not.toHaveBeenCalled()
    expect(ids(result.current.messages)[0]).toBe('n')
  })

  it('canal não marca nada como lido', async () => {
    const { result } = await renderHook(() => useRoomMessages({ kind: 'channel', id: 'c1' }))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(markConversationRead).not.toHaveBeenCalled()
  })
})
