import { act, renderHook } from '@testing-library/react-native'
import { useCallSessionStore } from '../../call/store/callSessionStore'
import { postTelemetry } from '../api/telemetry'
import { callEventLog } from '../lib/callTelemetryState'
import { useCallTelemetry } from './useCallTelemetry'

jest.mock('../api/telemetry', () => ({ postTelemetry: jest.fn().mockResolvedValue(undefined) }))
let mockEmitNetwork: (state: unknown) => void = () => {}
const mockOffNetwork = jest.fn()
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    addEventListener: jest.fn((listener: (state: unknown) => void) => {
      mockEmitNetwork = listener
      listener({ type: 'wifi', details: {} })
      return mockOffNetwork
    })
  }
}))

const post = postTelemetry as jest.Mock
const flush = async (): Promise<void> => {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

describe('useCallTelemetry', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    post.mockClear()
    callEventLog.take()
    useCallSessionStore.getState().reset()
  })
  afterEach(() => jest.useRealTimers())

  it('fora de call não manda nada nem ouve a rede', async () => {
    await renderHook(() => useCallTelemetry())
    await act(async () => {
      jest.advanceTimersByTime(120_000)
      await flush()
    })
    expect(post).not.toHaveBeenCalled()
    expect(mockOffNetwork).not.toHaveBeenCalled()
  })

  it('na call manda a voz com o contexto do Android; ao sair, o fim e a troca de rede', async () => {
    const { unmount } = await renderHook(() => useCallTelemetry())
    act(() => useCallSessionStore.getState().begin({ callId: 'c1', kind: 'channel', phase: 'connecting' }))
    act(() => useCallSessionStore.getState().setPhase('active'))
    await act(async () => {
      jest.advanceTimersByTime(20_000)
      await flush()
    })
    const [first] = post.mock.calls[0][0]
    expect(first).toMatchObject({ kind: 'call', call_id: 'c1', ended: false, context: { target: 'android', network: 'wifi' } })
    expect(first.sample.connect_ms).toEqual(expect.any(Number))

    act(() => mockEmitNetwork({ type: 'cellular', details: { cellularGeneration: '4g' } }))
    await act(async () => {
      useCallSessionStore.getState().reset()
      await flush()
    })
    const last = post.mock.calls.at(-1)![0][0]
    expect(last).toMatchObject({ kind: 'call', ended: true, events: [{ type: 'rede_trocou', detail: 'wifi → cellular-4g' }] })
    expect(mockOffNetwork).toHaveBeenCalled()
    await unmount()
  })
})
