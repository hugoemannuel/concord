import { beforeEach, describe, expect, it, vi } from 'vitest'

type Call = {
  status: 'idle' | 'connecting' | 'active'
  type: 'dm' | 'channel' | null
  serverId: string | null
  channelId: string | null
  participants: { id: string }[]
  availableScreens: string[]
  watchedScreenIds: string[]
  endCall: () => void
  joinVoiceChannel: (channelId: string) => Promise<void>
  watchScreen: (userId: string) => void
  focusWatchedScreen: (userId: string) => void
}

const h = vi.hoisted(() => ({ call: {} as Call }))
vi.mock('./callStore', () => ({ useCallStore: { getState: () => h.call } }))
vi.mock('../../../app/router', () => ({ default: { navigate: vi.fn(async () => {}) } }))
vi.mock('../../../shared/store/toastStore', () => ({ showToast: { error: vi.fn() } }))
// Sem esperar: responde com o que o predicado diz da chamada agora.
vi.mock('../lib/screenPreviewFlow', () => ({
  waitUntil: vi.fn(async (store: { getState: () => Call }, ready: (s: Call) => boolean | null) =>
    ready(store.getState())
  )
}))

import router from '../../../app/router'
import { showToast } from '../../../shared/store/toastStore'
import { startWatchingStream, type StreamJoinRequest } from './streamJoinStore'

const join: StreamJoinRequest = {
  userId: 'ana',
  name: 'Ana',
  target: { kind: 'join', callId: 'k1', channelId: 'c1', serverId: 's1' }
}

function idleCall(): Call {
  const call: Call = {
    status: 'idle',
    type: null,
    serverId: null,
    channelId: null,
    participants: [],
    availableScreens: ['ana'],
    watchedScreenIds: [],
    endCall: vi.fn(),
    joinVoiceChannel: vi.fn(async (channelId: string) => {
      Object.assign(call, { status: 'active', type: 'channel', serverId: 's1', channelId })
    }),
    watchScreen: vi.fn(),
    focusWatchedScreen: vi.fn()
  }
  return call
}

describe('startWatchingStream', () => {
  beforeEach(() => {
    h.call = idleCall()
    vi.mocked(router.navigate).mockClear()
    vi.mocked(showToast.error).mockClear()
  })

  it('entra no canal dela, abre a chamada e assiste à tela', async () => {
    await startWatchingStream(join)
    expect(h.call.joinVoiceChannel).toHaveBeenCalledWith('c1')
    expect(h.call.endCall).not.toHaveBeenCalled()
    expect(router.navigate).toHaveBeenCalledWith('/servers/s1/channels/c1')
    expect(h.call.watchScreen).toHaveBeenCalledWith('ana')
    expect(h.call.focusWatchedScreen).toHaveBeenCalledWith('ana')
  })

  it('numa DM, sai dela antes de entrar no canal', async () => {
    Object.assign(h.call, { status: 'active', type: 'dm' })
    await startWatchingStream(join)
    expect(h.call.endCall).toHaveBeenCalled()
  })

  it('falhou ao entrar: avisa (mensagem do erro ou o padrão) e para', async () => {
    vi.mocked(h.call.joinVoiceChannel).mockRejectedValueOnce(new Error('lotado'))
    await startWatchingStream(join)
    expect(showToast.error).toHaveBeenLastCalledWith('lotado')
    vi.mocked(h.call.joinVoiceChannel).mockRejectedValueOnce('x')
    await startWatchingStream(join)
    expect(showToast.error).toHaveBeenLastCalledWith('Falha ao entrar no canal de voz.')
    expect(router.navigate).not.toHaveBeenCalled()
  })

  it('sala trancou no caminho (continua fora do canal): não abre nada', async () => {
    vi.mocked(h.call.joinVoiceChannel).mockResolvedValueOnce()
    await startWatchingStream(join)
    expect(router.navigate).not.toHaveBeenCalled()
  })

  it('já na chamada (assistir): abre a chamada, sem entrar em canal', async () => {
    Object.assign(h.call, { status: 'active', type: 'dm', participants: [{ id: 'ana' }] })
    h.call.watchedScreenIds = ['ana']
    await startWatchingStream({ ...join, target: { kind: 'watch', callId: 'k1' } })
    expect(h.call.joinVoiceChannel).not.toHaveBeenCalled()
    expect(router.navigate).toHaveBeenCalledWith('/dm/ana')
    expect(h.call.watchScreen).not.toHaveBeenCalled()
    expect(h.call.focusWatchedScreen).toHaveBeenCalledWith('ana')
  })

  it('a tela não apareceu a tempo: avisa se ainda está na chamada', async () => {
    h.call.availableScreens = []
    await startWatchingStream(join)
    expect(showToast.error).toHaveBeenCalledWith('A transmissão não está mais disponível.')
    expect(h.call.watchScreen).not.toHaveBeenCalled()
  })

  it('a chamada caiu enquanto esperava: para sem avisar', async () => {
    vi.mocked(router.navigate).mockImplementationOnce(async () => {
      h.call.status = 'idle'
    })
    await startWatchingStream(join)
    expect(showToast.error).not.toHaveBeenCalled()
    expect(h.call.focusWatchedScreen).not.toHaveBeenCalled()
  })
})
