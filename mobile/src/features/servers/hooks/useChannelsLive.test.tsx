import { act, renderHook } from '@testing-library/react-native'
import type { WsEvent } from '../../../shared/api/ws'
import { useAuthStore } from '../../auth/store/authStore'
import { useServersStore } from '../store/serversStore'
import { useChannelsLive } from './useChannelsLive'

let wsHandler: (event: WsEvent) => void = () => {}
let reconnect: () => void = () => {}
jest.mock('../../../shared/api/ws', () => ({
  onWsEvent: jest.fn((l: (e: WsEvent) => void) => ((wsHandler = l), () => {}))
}))
jest.mock('../../../shared/api/realtime', () => ({
  realtime: { subscribe: jest.fn() },
  onRealtimeReconnect: jest.fn((l: () => void) => ((reconnect = l), () => {}))
}))

const loadChannels = jest.fn().mockResolvedValue(undefined)
const emit = (type: string, payload: object) => act(async () => wsHandler({ type, payload }))

describe('useChannelsLive', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    wsHandler = () => {}
    useAuthStore.setState({ status: 'signedIn' } as never)
    useServersStore.setState({ channelsByServer: { s1: [], s2: [] }, loadChannels } as never)
  })

  it.each(['channel:create', 'channel:update', 'channel:delete', 'channel:reorder', 'category:changed', 'server:permissions:invalidate'])('%s recarrega os canais do servidor do evento', async (type) => {
    await renderHook(() => useChannelsLive())
    await emit(type, { server_id: 's1' })
    expect(loadChannels).toHaveBeenCalledTimes(1)
    expect(loadChannels).toHaveBeenCalledWith('s1')
  })

  it('ignora servidor cujos canais ainda não foram carregados e outros eventos', async () => {
    await renderHook(() => useChannelsLive())
    await emit('channel:create', { server_id: 'desconhecido' })
    await emit('message:create', { server_id: 's1' })
    expect(loadChannels).not.toHaveBeenCalled()
  })

  it('depois de uma queda da conexão recarrega os canais já carregados', async () => {
    await renderHook(() => useChannelsLive())
    await act(async () => reconnect())
    expect(loadChannels).toHaveBeenCalledWith('s1')
    expect(loadChannels).toHaveBeenCalledWith('s2')
  })

  it('deslogado não escuta nada', async () => {
    useAuthStore.setState({ status: 'signedOut' } as never)
    await renderHook(() => useChannelsLive())
    await emit('channel:create', { server_id: 's1' })
    expect(loadChannels).not.toHaveBeenCalled()
  })
})
