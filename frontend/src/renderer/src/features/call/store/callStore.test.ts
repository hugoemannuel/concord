import { beforeEach, describe, expect, it, vi } from 'vitest'

// ─── Fakes de mídia (node não tem MediaStream) ──────────────────────────────

interface FakeTrack {
  id: string
  kind: 'audio' | 'video'
  enabled: boolean
  stopped: boolean
  contentHint: string
  stop: () => void
  addEventListener: (type: string, fn: () => void) => void
}

function fakeTrack(kind: 'audio' | 'video'): FakeTrack {
  const track: FakeTrack = {
    id: `${kind}-${Math.random()}`,
    kind,
    enabled: true,
    stopped: false,
    contentHint: '',
    stop: () => {
      track.stopped = true
    },
    addEventListener: () => {}
  }
  return track
}

function fakeStream(...kinds: Array<'audio' | 'video'>): MediaStream {
  const tracks = kinds.map(fakeTrack)
  return {
    getTracks: () => tracks,
    getAudioTracks: () => tracks.filter((t) => t.kind === 'audio'),
    getVideoTracks: () => tracks.filter((t) => t.kind === 'video')
  } as unknown as MediaStream
}

/** Microfone como o rtc.getAudioStream devolve (stream processado + stop). */
function fakeMic(stream = fakeStream('audio')): {
  stream: MediaStream
  setNoiseSuppression: ReturnType<typeof vi.fn>
  stop: ReturnType<typeof vi.fn>
} {
  return {
    stream,
    setNoiseSuppression: vi.fn(),
    stop: vi.fn(() => stream.getTracks().forEach((t) => t.stop()))
  }
}

const allStopped = (stream: MediaStream): boolean =>
  (stream.getTracks() as unknown as FakeTrack[]).every((t) => t.stopped)

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

// ─── Mocks dos módulos que o store usa ──────────────────────────────────────

const rtc = vi.hoisted(() => ({
  getAudioStream: vi.fn(),
  // Modal do app (sem seletor do sistema): a qualidade vem com a fonte.
  askScreenQuality: vi.fn(async () => null),
  getDisplayStream: vi.fn(),
  getCameraStream: vi.fn()
}))
vi.mock('../lib/rtc', () => rtc)

// Motor nativo da live: por padrão indisponível (segue pelo Chromium).
const native = vi.hoisted(() => ({
  tryNativeLive: vi.fn(async (_request: { onEnded: (failed: boolean) => void }) => 'fallback'),
  nativeLiveActive: vi.fn(() => false),
  nativeLivePreview: vi.fn(() => null),
  setNativeLiveQuality: vi.fn(() => false),
  stopNativeLive: vi.fn()
}))
vi.mock('../lib/nativeLiveShare', () => native)

const media = vi.hoisted(() => ({
  instances: [] as Array<Record<string, ReturnType<typeof vi.fn>> & { handlers: unknown }>,
  events: [] as string[],
  connect: vi.fn(),
  publishScreen: vi.fn(),
  updateScreenQuality: vi.fn(),
  publishCamera: vi.fn(),
  replaceCamera: vi.fn(async () => {}),
  setWatchedScreens: vi.fn()
}))
vi.mock('../lib/livekit', () => ({
  CallMedia: class {
    handlers: unknown
    connect = media.connect
    publishScreen = media.publishScreen
    updateScreenQuality = media.updateScreenQuality
    publishCamera = media.publishCamera
    replaceCamera = media.replaceCamera
    setWatchedScreens = media.setWatchedScreens
    setMicMuted = vi.fn(async (muted: boolean) => {
      media.events.push(`mic(${muted})`)
    })
    unpublish = vi.fn(async () => {})
    replaceMic = vi.fn(async () => {})
    ensureMic = vi.fn(async () => {})
    disconnect = vi.fn()
    constructor(handlers: unknown) {
      this.handlers = handlers
      media.instances.push(this as never)
    }
  }
}))

const api = vi.hoisted(() => ({
  startCall: vi.fn(),
  endCall: vi.fn(async () => ({ message: 'ok' })),
  getCallState: vi.fn(async () => ({ call: null, participants: [] })),
  getCallToken: vi.fn(async () => ({ token: 'tok' })),
  acceptCall: vi.fn(async () => undefined),
  putScreenPreview: vi.fn(async () => {})
}))
vi.mock('../api/calls', () => api)
const snapshot = vi.hoisted(() => ({ captureScreenPreview: vi.fn(async () => 'FOTO') }))
vi.mock('../lib/screenSnapshot', () => snapshot)
vi.mock('../../../shared/api/client', () => ({ ApiError: class extends Error {} }))
vi.mock('../../../shared/lib/config', () => ({
  LIVEKIT_URL: 'ws://servidor',
  API_BASE_URL: '/api'
}))

const chat = vi.hoisted(() => ({
  sendEvent: vi.fn(),
  subscribeRoom: vi.fn(),
  unsubscribeRoom: vi.fn(),
  isWsConnected: () => true
}))
vi.mock('../../chat/store/chatStore', () => ({ useChatStore: { getState: () => chat } }))
const me = vi.hoisted(() => ({ user: { id: 'eu', entrance_sound_url: null as string | null } }))
vi.mock('../../auth/store/authStore', () => ({
  useAuthStore: { getState: () => ({ user: me.user }) }
}))
const entrance = vi.hoisted(() => ({ playEntranceClip: vi.fn(async () => true) }))
vi.mock('../lib/entranceSoundPlayer', () => entrance)
vi.mock('../../../shared/store/toastStore', () => ({
  showToast: { error: vi.fn(), info: vi.fn(), success: vi.fn() }
}))
const sounds = vi.hoisted(() => ({ playSound: vi.fn(), setSoundOutput: vi.fn() }))
vi.mock('../lib/sounds', () => sounds)

/** Detecção local de fala: grava cada watch (microfone, handlers, stop). */
interface FakeWatch {
  mic: { stream: MediaStream }
  handlers: { onChange: (speaking: boolean) => void; onUnavailable: () => void }
  stop: ReturnType<typeof vi.fn>
}
const vad = vi.hoisted(() => ({ watches: [] as FakeWatch[] }))
vi.mock('../lib/localSpeaking', () => ({
  watchLocalSpeaking: (mic: FakeWatch['mic'], handlers: FakeWatch['handlers']) => {
    const stop = vi.fn()
    vad.watches.push({ mic, handlers, stop })
    return stop
  }
}))

const bgPipeline = vi.hoisted(() => ({ create: vi.fn() }))
vi.mock('../lib/backgroundPipeline', () => ({ createBackgroundPipeline: bgPipeline.create }))

import { CallLockedError, useCallStore } from './callStore'
import { useIncomingCallStore } from './incomingCallStore'
import { useVideoSettingsStore } from './videoSettingsStore'
import { useVideoModalStore } from './videoModalStore'
import { ApiError } from '../../../shared/api/client'
import { showToast } from '../../../shared/store/toastStore'

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

const empty = {
  streams: {},
  screenStreams: {},
  screenAudioStreams: {},
  videoStreams: {},
  mediaPeers: {},
  availableScreens: [] as string[]
}

function onRemoteMedia(m: unknown): void {
  const handlers = media.instances[0].handlers as { onRemoteMedia: (m: unknown) => void }
  handlers.onRemoteMedia(m)
}

async function joinChannel(): Promise<void> {
  await useCallStore.getState().startChannelCall('canal-1')
  await flush()
  await flush()
}

beforeEach(() => {
  useVideoSettingsStore.setState({
    cameraId: '',
    alwaysPreview: false,
    background: { mode: 'none', image: null },
    customs: []
  })
  useVideoModalStore.getState().close()
  useCallStore.getState().endCall()
  useIncomingCallStore.getState().clear()
  vi.clearAllMocks()
  media.instances.length = 0
  media.events.length = 0
  vad.watches.length = 0
  rtc.getAudioStream.mockImplementation(async () => fakeMic())
  api.startCall.mockResolvedValue({ id: 'call-1' })
  media.connect.mockResolvedValue(undefined)
  media.publishScreen.mockResolvedValue(undefined)
  media.updateScreenQuality.mockResolvedValue(undefined)
  media.publishCamera.mockResolvedValue(undefined)
})

describe('callStore — mídia via LiveKit', () => {
  it('motor nativo: live no ar sem stream local; caiu no meio, volta pelo Chromium', async () => {
    await joinChannel()
    const quality = { resolution: '1080p', frameRate: 30 } as const
    rtc.askScreenQuality.mockResolvedValueOnce(quality as never)
    native.tryNativeLive.mockResolvedValueOnce('started')
    await useCallStore.getState().startScreenShare()
    expect(rtc.getDisplayStream).not.toHaveBeenCalled()
    expect(useCallStore.getState()).toMatchObject({
      isScreenSharing: true,
      localScreenStream: null,
      screenShareQuality: quality
    })
    expect(chat.sendEvent).toHaveBeenCalledWith('call:screen', { call_id: 'call-1', active: true })

    native.setNativeLiveQuality.mockReturnValueOnce(true)
    useCallStore.getState().updateScreenQuality({ resolution: '720p', frameRate: 60 })
    expect(media.updateScreenQuality).not.toHaveBeenCalled()
    expect(useCallStore.getState().screenShareQuality).toEqual({
      resolution: '720p',
      frameRate: 60
    })

    const stream = fakeStream('video')
    rtc.getDisplayStream.mockResolvedValueOnce(stream)
    const { onEnded } = native.tryNativeLive.mock.calls[0][0]
    onEnded(true)
    await flush()
    expect(native.stopNativeLive).toHaveBeenCalled()
    expect(useCallStore.getState().localScreenStream).toBe(stream)
    expect(media.publishScreen).toHaveBeenCalledWith(stream)
  })

  it('motor nativo: fechar o seletor do sistema não abre o do Chromium', async () => {
    await joinChannel()
    rtc.askScreenQuality.mockResolvedValueOnce({ resolution: '1080p', frameRate: 30 } as never)
    native.tryNativeLive.mockResolvedValueOnce('cancelled')
    await useCallStore.getState().startScreenShare()
    expect(rtc.getDisplayStream).not.toHaveBeenCalled()
    expect(useCallStore.getState().isScreenSharing).toBe(false)
  })

  it('troca qualidade sem encerrar a transmissão nem anunciar saída aos espectadores', async () => {
    await joinChannel()
    const stream = fakeStream('video', 'audio')
    rtc.getDisplayStream.mockResolvedValueOnce(stream)
    await useCallStore.getState().startScreenShare()
    chat.sendEvent.mockClear()
    const watched = useCallStore.getState().watchedScreenIds
    const sharers = useCallStore.getState().screenSharers
    useCallStore.getState().updateScreenQuality({ resolution: '720p', frameRate: 60 })
    await flush()
    expect(media.updateScreenQuality).toHaveBeenCalledWith(stream, {
      resolution: '720p',
      frameRate: 60
    })
    expect(useCallStore.getState()).toMatchObject({
      isScreenSharing: true,
      localScreenStream: stream,
      pendingScreenQuality: null,
      screenShareQuality: { resolution: '720p', frameRate: 60 },
      screenSharers: sharers,
      watchedScreenIds: watched
    })
    expect(chat.sendEvent).not.toHaveBeenCalled()
    expect(media.publishScreen).toHaveBeenCalledTimes(1)
    expect(allStopped(stream)).toBe(false)
  })

  it('ignora escolha igual à qualidade atual', async () => {
    await joinChannel()
    rtc.getDisplayStream.mockResolvedValueOnce(fakeStream('video'))
    await useCallStore.getState().startScreenShare()
    useCallStore.getState().updateScreenQuality({ resolution: '1080p', frameRate: 30 })
    await flush()
    expect(media.updateScreenQuality).not.toHaveBeenCalled()
    expect(useCallStore.getState().pendingScreenQuality).toBeNull()
  })

  it('aplica a última escolha sem perder trocas feitas durante uma atualização', async () => {
    await joinChannel()
    const stream = fakeStream('video')
    rtc.getDisplayStream.mockResolvedValueOnce(stream)
    await useCallStore.getState().startScreenShare()
    const waiting = deferred<void>()
    media.updateScreenQuality.mockReturnValueOnce(waiting.promise)
    const store = useCallStore.getState()
    store.updateScreenQuality({ resolution: '720p', frameRate: 60 })
    store.updateScreenQuality({ resolution: '1080p', frameRate: 60 })
    store.updateScreenQuality({ resolution: 'source', frameRate: 30 })
    expect(useCallStore.getState().pendingScreenQuality).toEqual({
      resolution: 'source',
      frameRate: 30
    })
    expect(media.updateScreenQuality).toHaveBeenCalledTimes(1)
    waiting.resolve()
    await flush()
    expect(media.updateScreenQuality).toHaveBeenCalledTimes(2)
    expect(media.updateScreenQuality).toHaveBeenLastCalledWith(stream, {
      resolution: 'source',
      frameRate: 30
    })
    expect(useCallStore.getState()).toMatchObject({
      pendingScreenQuality: null,
      screenShareQuality: { resolution: 'source', frameRate: 30 }
    })
  })

  it('descarta a conclusão de uma troca depois de parar a transmissão', async () => {
    await joinChannel()
    rtc.getDisplayStream.mockResolvedValueOnce(fakeStream('video'))
    await useCallStore.getState().startScreenShare()
    const waiting = deferred<void>()
    media.updateScreenQuality.mockReturnValueOnce(waiting.promise)
    useCallStore.getState().updateScreenQuality({ resolution: '720p', frameRate: 60 })
    expect(useCallStore.getState().pendingScreenQuality).toEqual({
      resolution: '720p',
      frameRate: 60
    })
    useCallStore.getState().stopScreenShare()
    waiting.resolve()
    await flush()
    expect(useCallStore.getState()).toMatchObject({
      isScreenSharing: false,
      screenShareQuality: null,
      pendingScreenQuality: null
    })
    expect(showToast.error).not.toHaveBeenCalled()
  })

  it('mantém a qualidade ativa e a transmissão quando a atualização falha', async () => {
    await joinChannel()
    rtc.getDisplayStream.mockResolvedValueOnce(fakeStream('video'))
    await useCallStore.getState().startScreenShare()
    const previous = useCallStore.getState().screenShareQuality
    media.updateScreenQuality.mockRejectedValueOnce(new Error('encoder'))
    useCallStore.getState().updateScreenQuality({ resolution: '720p', frameRate: 60 })
    await flush()
    expect(useCallStore.getState()).toMatchObject({
      isScreenSharing: true,
      screenShareQuality: previous,
      pendingScreenQuality: null
    })
    expect(showToast.error).toHaveBeenCalled()
  })

  it('retoma ensurdecido sem publicar áudio e restaura o mute anterior ao desensurdecer', async () => {
    const mic = fakeMic()
    rtc.getAudioStream.mockResolvedValue(mic)
    await useCallStore.getState().startChannelCall('canal-1', {
      userId: 'eu',
      backendUrl: 'api',
      serverId: 's',
      channelId: 'canal-1',
      muted: true,
      deafened: true,
      mutedBeforeDeafen: false
    })
    await flush()
    expect(mic.stream.getAudioTracks()[0].enabled).toBe(false)
    expect(media.connect).toHaveBeenCalledWith('ws://servidor', 'tok', expect.anything(), true)
    expect(useCallStore.getState().deafened).toBe(true)
    expect(media.publishCamera).not.toHaveBeenCalled()
    expect(media.publishScreen).not.toHaveBeenCalled()
    useCallStore.getState().toggleDeafen()
    expect(useCallStore.getState().muted).toBe(false)
    expect(mic.stream.getAudioTracks()[0].enabled).toBe(true)
  })

  it('não entra se a retomada foi cancelada enquanto o microfone abria', async () => {
    const waiting = deferred<ReturnType<typeof fakeMic>>()
    rtc.getAudioStream.mockReturnValue(waiting.promise)
    const abort = new AbortController()
    const work = useCallStore.getState().startChannelCall(
      'canal-1',
      {
        userId: 'eu',
        backendUrl: 'api',
        serverId: 's',
        channelId: 'canal-1',
        muted: false,
        deafened: false,
        mutedBeforeDeafen: false
      },
      abort.signal
    )
    abort.abort()
    const mic = fakeMic()
    waiting.resolve(mic)
    await work
    expect(api.startCall).not.toHaveBeenCalled()
    expect(allStopped(mic.stream)).toBe(true)
  })

  describe('startChannelCall — falhas ao entrar', () => {
    const resume = {
      userId: 'eu',
      backendUrl: 'api',
      serverId: 's',
      channelId: 'canal-1',
      muted: false,
      deafened: false,
      mutedBeforeDeafen: false
    }

    it('sem acesso ao microfone: avisa e não entra', async () => {
      rtc.getAudioStream.mockRejectedValue(new Error('negado'))
      await useCallStore.getState().startChannelCall('canal-1')
      expect(showToast.error).toHaveBeenCalledWith('Não foi possível acessar o microfone.')
      expect(useCallStore.getState().status).toBe('idle')
    })

    it('retomada sem microfone: rejeita para quem retoma tentar de novo', async () => {
      rtc.getAudioStream.mockRejectedValue(new Error('negado'))
      await expect(useCallStore.getState().startChannelCall('canal-1', resume)).rejects.toThrow(
        'microfone'
      )
    })

    it('o servidor recusou a entrada: avisa e volta ao ocioso', async () => {
      api.startCall.mockRejectedValue(new Error('fora do ar'))
      await useCallStore.getState().startChannelCall('canal-1')
      expect(showToast.error).toHaveBeenCalledWith('fora do ar')
      expect(useCallStore.getState().status).toBe('idle')
    })

    it('retomada recusada pelo servidor: rejeita em vez de avisar', async () => {
      api.startCall.mockRejectedValue(new Error('fora do ar'))
      await expect(useCallStore.getState().startChannelCall('canal-1', resume)).rejects.toThrow(
        'fora do ar'
      )
    })

    it('sala trancada (423): lança CallLockedError com a call', async () => {
      const locked = Object.assign(new ApiError(423, 'trancada'), {
        status: 423,
        body: { call_id: 'call-9' }
      })
      api.startCall.mockRejectedValue(locked)
      await expect(useCallStore.getState().startChannelCall('canal-1')).rejects.toBeInstanceOf(
        CallLockedError
      )
    })

    it('retomada cancelada enquanto o servidor respondia: sai da call recém-criada', async () => {
      const abort = new AbortController()
      api.startCall.mockImplementation(async () => {
        abort.abort()
        return { id: 'call-1' }
      })
      await useCallStore.getState().startChannelCall('canal-1', resume, abort.signal)
      expect(chat.sendEvent).toHaveBeenCalledWith('call:leave', { call_id: 'call-1' })
      expect(useCallStore.getState().status).toBe('idle')
    })
  })

  it('sair da chamada volta ao estado inicial, guardando o que vale entre chamadas', async () => {
    const data = (s: object): Record<string, unknown> =>
      Object.fromEntries(Object.entries(s).filter(([, v]) => typeof v !== 'function'))
    const initial = data(useCallStore.getInitialState())
    await joinChannel()
    useCallStore.setState({ stageVisible: true, muted: true, inputDeviceId: 'mic-2' })
    useCallStore.getState().endCall()
    expect(data(useCallStore.getState())).toEqual({
      ...initial,
      stageVisible: true,
      inputDeviceId: 'mic-2'
    })
  })

  it('descarta a tela escolhida quando a chamada acabou com o seletor aberto', async () => {
    await joinChannel()
    const picked = deferred<MediaStream>()
    rtc.getDisplayStream.mockReturnValue(picked.promise)

    const sharing = useCallStore.getState().startScreenShare()
    await useCallStore.getState().startScreenShare()
    expect(rtc.getDisplayStream).toHaveBeenCalledTimes(1)
    useCallStore.getState().endCall()
    const stream = fakeStream('video', 'audio')
    picked.resolve(stream)
    await sharing

    expect(useCallStore.getState().isScreenSharing).toBe(false)
    expect(allStopped(stream)).toBe(true)
    expect(chat.sendEvent).not.toHaveBeenCalledWith('call:screen', expect.anything())
  })

  it('desliga a câmera que chegou depois de a chamada acabar', async () => {
    await joinChannel()
    const camera = deferred<MediaStream>()
    rtc.getCameraStream.mockReturnValue(camera.promise)

    const turningOn = useCallStore.getState().toggleCamera()
    useCallStore.getState().endCall()
    const stream = fakeStream('video')
    camera.resolve(stream)
    await turningOn

    expect(useCallStore.getState().localCameraStream).toBeNull()
    expect(allStopped(stream)).toBe(true)
  })

  describe('fundo de vídeo da câmera', () => {
    type FakePipeline = {
      stream: MediaStream
      raw: MediaStream
      setSource: ReturnType<typeof vi.fn>
      destroy: ReturnType<typeof vi.fn>
      detach: ReturnType<typeof vi.fn>
      onError?: (e: 'segmenter') => void
    }
    let pipelines: FakePipeline[]
    beforeEach(() => {
      pipelines = []
      bgPipeline.create.mockImplementation(
        (raw: MediaStream, _effect: unknown, _env: unknown, onError?: (e: 'segmenter') => void) => {
          const p: FakePipeline = {
            stream: fakeStream('video'),
            raw,
            setSource: vi.fn(),
            destroy: vi.fn(),
            detach: vi.fn(() => raw),
            onError
          }
          pipelines.push(p)
          return p
        }
      )
      media.replaceCamera.mockResolvedValue(undefined)
      media.publishCamera.mockResolvedValue(undefined)
    })
    const blur = (): void =>
      useVideoSettingsStore.getState().setBackground({ mode: 'blur', image: null })
    async function cameraOn(raw = fakeStream('video')): Promise<MediaStream> {
      rtc.getCameraStream.mockResolvedValue(raw)
      await useCallStore.getState().toggleCamera()
      return raw
    }

    it('sem fundo: publica a câmera crua e não cria pipeline', async () => {
      await joinChannel()
      const raw = await cameraOn()
      expect(bgPipeline.create).not.toHaveBeenCalled()
      expect(useCallStore.getState().localCameraStream).toBe(raw)
      expect(media.publishCamera).toHaveBeenCalledWith(raw)
    })

    it('com fundo: prévia e sala recebem o stream processado', async () => {
      blur()
      await joinChannel()
      const raw = await cameraOn()
      expect(bgPipeline.create).toHaveBeenCalledWith(
        raw,
        expect.any(Function),
        undefined,
        expect.any(Function)
      )
      expect(useCallStore.getState().localCameraStream).toBe(pipelines[0].stream)
      expect(media.publishCamera).toHaveBeenCalledWith(pipelines[0].stream)
    })

    it('imagem escolhida que sumiu não liga o pipeline', async () => {
      useVideoSettingsStore.setState({
        background: { mode: 'image', image: { kind: 'custom', id: 'x' } }
      })
      await joinChannel()
      await cameraOn()
      expect(bgPipeline.create).not.toHaveBeenCalled()
    })

    it('o efeito enxerga o fundo escolhido a cada quadro', async () => {
      blur()
      await joinChannel()
      await cameraOn()
      const getEffect = bgPipeline.create.mock.calls[0][1] as () => {
        mode: string
        image: string | null
      }
      expect(getEffect()).toEqual({ mode: 'blur', image: null, blob: null })
      const id = useVideoSettingsStore.getState().addCustom('data:image/jpeg;base64,AAA')
      expect(id).toBeTruthy()
      expect(getEffect()).toEqual({
        mode: 'image',
        image: 'data:image/jpeg;base64,AAA',
        blob: null
      })
    })

    it('abre a câmera escolhida nas configurações', async () => {
      useVideoSettingsStore.getState().setCameraId('cam-2')
      await joinChannel()
      await cameraOn()
      expect(rtc.getCameraStream).toHaveBeenCalledWith('cam-2')
    })

    it('desligar a câmera encerra o pipeline', async () => {
      blur()
      await joinChannel()
      await cameraOn()
      await useCallStore.getState().toggleCamera()
      await flush()
      expect(useCallStore.getState().localCameraStream).toBeNull()
      expect(pipelines[0].destroy).toHaveBeenCalledTimes(1)
    })

    it('encerrar a chamada encerra o pipeline', async () => {
      blur()
      await joinChannel()
      await cameraOn()
      useCallStore.getState().endCall()
      expect(pipelines[0].destroy).toHaveBeenCalledTimes(1)
    })

    it('pipeline que não monta cai para a câmera crua, com aviso, e não insiste', async () => {
      blur()
      await joinChannel()
      bgPipeline.create.mockImplementation(() => {
        throw new Error('sem canvas')
      })
      vi.mocked(showToast.error).mockClear()
      const raw = await cameraOn()
      expect(useCallStore.getState().localCameraStream).toBe(raw)
      expect(media.publishCamera).toHaveBeenCalledWith(raw)
      expect(showToast.error).toHaveBeenCalledWith(expect.stringMatching(/fundo/))
      await useCallStore.getState().toggleCamera()
      await cameraOn(fakeStream('video'))
      expect(bgPipeline.create).toHaveBeenCalledTimes(1)
      // escolher outro fundo volta a tentar
      useVideoSettingsStore.getState().setBackground({ mode: 'none', image: null })
      blur()
      await useCallStore.getState().toggleCamera()
      await cameraOn(fakeStream('video'))
      expect(bgPipeline.create).toHaveBeenCalledTimes(2)
    })

    it('modelo que não carrega volta para a câmera crua, sem desligar a câmera', async () => {
      blur()
      await joinChannel()
      const raw = await cameraOn()
      vi.mocked(showToast.error).mockClear()
      pipelines[0].onError?.('segmenter')
      await flush()
      await flush()
      expect(pipelines[0].detach).toHaveBeenCalled()
      expect(media.replaceCamera).toHaveBeenCalledWith(raw)
      expect(useCallStore.getState().localCameraStream).toBe(raw)
      expect(showToast.error).toHaveBeenCalledWith(expect.stringMatching(/fundo/))
    })

    it('ligar o fundo com a câmera aberta troca o stream sem reabrir a câmera', async () => {
      await joinChannel()
      const raw = await cameraOn()
      rtc.getCameraStream.mockClear()
      blur()
      await flush()
      await flush()
      expect(rtc.getCameraStream).not.toHaveBeenCalled()
      expect(bgPipeline.create).toHaveBeenCalledWith(
        raw,
        expect.any(Function),
        undefined,
        expect.any(Function)
      )
      expect(media.replaceCamera).toHaveBeenCalledWith(pipelines[0].stream)
      expect(useCallStore.getState().localCameraStream).toBe(pipelines[0].stream)
    })

    it('desligar o fundo com a câmera aberta volta para a câmera crua', async () => {
      blur()
      await joinChannel()
      const raw = await cameraOn()
      useVideoSettingsStore.getState().setBackground({ mode: 'none', image: null })
      await flush()
      await flush()
      expect(pipelines[0].detach).toHaveBeenCalledTimes(1)
      expect(pipelines[0].destroy).not.toHaveBeenCalled()
      expect(media.replaceCamera).toHaveBeenLastCalledWith(raw)
      expect(useCallStore.getState().localCameraStream).toBe(raw)
      expect(raw.getTracks().every((t) => !(t as unknown as { stopped: boolean }).stopped)).toBe(
        true
      )
    })

    it('trocar de desfoque para imagem não recria nada', async () => {
      blur()
      await joinChannel()
      await cameraOn()
      media.replaceCamera.mockClear()
      useVideoSettingsStore.getState().addCustom('data:image/jpeg;base64,AAA')
      await flush()
      expect(bgPipeline.create).toHaveBeenCalledTimes(1)
      expect(media.replaceCamera).not.toHaveBeenCalled()
    })

    it('GIF salvo que termina de carregar com a câmera aberta liga o efeito', async () => {
      useVideoSettingsStore.setState({
        background: { mode: 'image', image: { kind: 'custom', id: 'g1' } },
        customs: [{ id: 'g1', dataUrl: '', animated: true }]
      })
      await joinChannel()
      await cameraOn()
      expect(bgPipeline.create).not.toHaveBeenCalled()
      // o IndexedDB respondeu: o GIF ganhou o blob: da sessão
      useVideoSettingsStore.setState({
        customs: [{ id: 'g1', dataUrl: 'blob:test/0', animated: true }]
      })
      await flush()
      await flush()
      expect(bgPipeline.create).toHaveBeenCalledTimes(1)
      expect(media.replaceCamera).toHaveBeenCalledWith(pipelines[0].stream)
    })

    it('"sempre ver prévia" abre a prévia em vez de ligar a câmera', async () => {
      useVideoSettingsStore.getState().setAlwaysPreview(true)
      await joinChannel()
      rtc.getCameraStream.mockResolvedValue(fakeStream('video'))
      await useCallStore.getState().toggleCamera()
      expect(useVideoModalStore.getState().mode).toBe('preview')
      expect(rtc.getCameraStream).not.toHaveBeenCalled()
      await useCallStore.getState().toggleCamera({ skipPreview: true })
      expect(rtc.getCameraStream).toHaveBeenCalledTimes(1)
      expect(useCallStore.getState().localCameraStream).not.toBeNull()
    })

    it('"sempre ver prévia" não atrapalha desligar a câmera', async () => {
      await joinChannel()
      await cameraOn()
      useVideoSettingsStore.getState().setAlwaysPreview(true)
      await useCallStore.getState().toggleCamera()
      expect(useCallStore.getState().localCameraStream).toBeNull()
      expect(useVideoModalStore.getState().mode).toBeNull()
    })

    describe('trocar de câmera', () => {
      it('sem câmera ligada só guarda a escolha', async () => {
        await joinChannel()
        await useCallStore.getState().setCameraDevice('cam-2')
        expect(useVideoSettingsStore.getState().cameraId).toBe('cam-2')
        expect(rtc.getCameraStream).not.toHaveBeenCalled()
      })

      it('ao vivo, sem efeito: troca a track publicada e para a câmera antiga', async () => {
        await joinChannel()
        const old = await cameraOn()
        const next = fakeStream('video')
        rtc.getCameraStream.mockResolvedValue(next)
        await useCallStore.getState().setCameraDevice('cam-2')
        expect(rtc.getCameraStream).toHaveBeenLastCalledWith('cam-2')
        expect(media.replaceCamera).toHaveBeenCalledWith(next)
        expect(allStopped(old)).toBe(true)
        expect(allStopped(next)).toBe(false)
        expect(useCallStore.getState().localCameraStream).toBe(next)
      })

      it('ao vivo, com efeito: o pipeline troca a fonte e nada é republicado', async () => {
        blur()
        await joinChannel()
        await cameraOn()
        media.replaceCamera.mockClear()
        const next = fakeStream('video')
        rtc.getCameraStream.mockResolvedValue(next)
        await useCallStore.getState().setCameraDevice('cam-2')
        expect(pipelines[0].setSource).toHaveBeenCalledWith(next)
        expect(media.replaceCamera).not.toHaveBeenCalled()
        expect(useCallStore.getState().localCameraStream).toBe(pipelines[0].stream)
      })

      it('câmera que não abre: avisa, mantém a atual e volta a escolha', async () => {
        await joinChannel()
        const old = await cameraOn()
        rtc.getCameraStream.mockRejectedValue(new Error('ocupada'))
        vi.mocked(showToast.error).mockClear()
        await useCallStore.getState().setCameraDevice('cam-2')
        expect(useVideoSettingsStore.getState().cameraId).toBe('')
        expect(useCallStore.getState().localCameraStream).toBe(old)
        expect(allStopped(old)).toBe(false)
        expect(showToast.error).toHaveBeenCalledWith(expect.stringMatching(/câmera/))
      })

      it('falha ao publicar a nova: para a nova, mantém a atual', async () => {
        await joinChannel()
        const old = await cameraOn()
        const next = fakeStream('video')
        rtc.getCameraStream.mockResolvedValue(next)
        media.replaceCamera.mockRejectedValueOnce(new Error('x'))
        await useCallStore.getState().setCameraDevice('cam-2')
        expect(allStopped(next)).toBe(true)
        expect(allStopped(old)).toBe(false)
        expect(useCallStore.getState().localCameraStream).toBe(old)
      })

      it('a câmera nova chega depois de a chamada acabar: é parada', async () => {
        await joinChannel()
        await cameraOn()
        const opening = deferred<MediaStream>()
        rtc.getCameraStream.mockReturnValue(opening.promise)
        const changing = useCallStore.getState().setCameraDevice('cam-2')
        await flush() // a troca já começou a abrir a câmera nova
        useCallStore.getState().endCall()
        const next = fakeStream('video')
        opening.resolve(next)
        await changing
        expect(allStopped(next)).toBe(true)
      })
    })
  })

  it('falha ao publicar a tela depois de conectar não derruba a chamada', async () => {
    // Como o CallMedia real: antes de conectar, publicar é no-op; depois, falha.
    let isConnected = false
    const connected = deferred<void>()
    media.connect.mockImplementation(async () => {
      await connected.promise
      isConnected = true
    })
    rtc.getDisplayStream.mockResolvedValue(fakeStream('video', 'audio'))
    media.publishScreen.mockImplementation(async () => {
      if (isConnected) throw new Error('falhou')
    })

    await useCallStore.getState().startChannelCall('canal-1')
    await useCallStore.getState().startScreenShare()
    connected.resolve()
    await flush()
    await flush()

    expect(useCallStore.getState().status).toBe('active')
    expect(useCallStore.getState().isScreenSharing).toBe(false)
  })

  it('reaplica o mute atual depois de conectar (desmutou durante a conexão)', async () => {
    // Registra a ordem: mute antes de conectar é no-op no CallMedia real.
    const events = media.events
    const token = deferred<{ token: string }>()
    const connected = deferred<void>()
    api.getCallToken.mockReturnValue(token.promise)
    media.connect.mockImplementation(
      async (_url: string, _tok: string, _mic: unknown, muted: boolean) => {
        events.push(`connect(muted=${muted})`)
        await connected.promise
        events.push('connected')
      }
    )

    await useCallStore.getState().startChannelCall('canal-1')
    useCallStore.getState().toggleMute() // muta antes de pedir a conexão
    token.resolve({ token: 'tok' })
    await flush()
    useCallStore.getState().toggleMute() // desmuta durante a conexão
    connected.resolve()
    await flush()
    await flush()

    expect(events).toContain('connect(muted=true)')
    // depois de conectar, o estado atual (desmutado) precisa ser reaplicado
    const afterConnect = events.slice(events.indexOf('connected') + 1)
    expect(afterConnect.at(-1)).toBe('mic(false)')
    expect(useCallStore.getState().muted).toBe(false)
  })

  it('sem detecção local, marca quem está falando pelo servidor, incluindo o próprio usuário', async () => {
    await joinChannel()
    vad.watches[0].handlers.onUnavailable()
    const handlers = media.instances[0].handlers as { onActiveSpeakers: (ids: string[]) => void }

    handlers.onActiveSpeakers(['eu', 'ana'])
    expect(useCallStore.getState().speakingIds).toEqual(['eu', 'ana'])

    handlers.onActiveSpeakers([])
    expect(useCallStore.getState().speakingIds).toEqual([])
  })

  // Regressão (mesma conta no celular e no desktop): substituído pelo outro aparelho, o desktop esperava 60 s e
  // chamava endCall(), que manda call:leave e tirava da chamada a conta inteira, inclusive o aparelho que entrou.
  it('substituído por outro aparelho da mesma conta (DUPLICATE_IDENTITY): sai na hora, sem call:leave', async () => {
    await joinChannel()
    vi.useFakeTimers()
    try {
      chat.sendEvent.mockClear()
      const handlers = media.instances[0].handlers as {
        onConnectionLost: (reason?: number) => void
      }
      handlers.onConnectionLost(2)
      expect(useCallStore.getState().callId).toBeNull()
      vi.advanceTimersByTime(120_000)
      expect(chat.sendEvent).not.toHaveBeenCalledWith('call:leave', expect.anything())
    } finally {
      vi.useRealTimers()
    }
  })

  it('limpa quem está falando ao sair da chamada', async () => {
    await joinChannel()
    const handlers = media.instances[0].handlers as { onActiveSpeakers: (ids: string[]) => void }
    handlers.onActiveSpeakers(['eu'])

    useCallStore.getState().endCall()

    expect(useCallStore.getState().speakingIds).toEqual([])
  })

  it('ensurdecer também muta, e voltar restaura o mute anterior (como no Discord)', async () => {
    await joinChannel()

    useCallStore.getState().toggleDeafen()
    expect(useCallStore.getState()).toMatchObject({ deafened: true, muted: true })

    useCallStore.getState().toggleDeafen()
    expect(useCallStore.getState()).toMatchObject({ deafened: false, muted: false })
  })

  it('desmutar enquanto ensurdecido também tira o ensurdecer', async () => {
    await joinChannel()
    useCallStore.getState().toggleDeafen()

    useCallStore.getState().toggleMute()

    expect(useCallStore.getState()).toMatchObject({ deafened: false, muted: false })
  })

  it('avisa o servidor ao mutar e ensurdecer', async () => {
    await joinChannel()
    chat.sendEvent.mockClear()

    useCallStore.getState().toggleMute()
    expect(chat.sendEvent).toHaveBeenLastCalledWith('call:voice', {
      call_id: 'call-1',
      muted: true,
      deafened: false
    })

    useCallStore.getState().toggleDeafen()
    expect(chat.sendEvent).toHaveBeenLastCalledWith('call:voice', {
      call_id: 'call-1',
      muted: true,
      deafened: true
    })
  })

  it('mostra quem está mudo/ensurdecido a partir do evento call:voice', async () => {
    await joinChannel()
    useCallStore.getState().setServerCalls('s1', {
      'canal-1': {
        call: { id: 'call-1' } as never,
        participants: [{ call_id: 'call-1', user_id: 'ana', role: 'member', joined_at: '' }]
      }
    })

    useCallStore.getState().handleWsEvent({
      type: 'call:voice',
      payload: { call_id: 'call-1', user_id: 'ana', muted: true, deafened: true }
    })

    expect(useCallStore.getState().voiceStates.ana).toEqual({
      muted: true,
      deafened: true,
      serverMuted: false,
      serverDeafened: false
    })
    expect(useCallStore.getState().serverCalls['canal-1'].participants[0]).toMatchObject({
      muted: true,
      deafened: true
    })
  })

  it('mostra o que um moderador impôs (silenciar/ensurdecer no servidor)', async () => {
    await joinChannel()
    useCallStore.getState().setServerCalls('s1', {
      'canal-1': {
        call: { id: 'call-1' } as never,
        participants: [{ call_id: 'call-1', user_id: 'ana', role: 'member', joined_at: '' }]
      }
    })

    useCallStore.getState().handleWsEvent({
      type: 'call:voice',
      payload: {
        call_id: 'call-1',
        user_id: 'ana',
        muted: false,
        deafened: false,
        server_muted: true,
        server_deafened: false
      }
    })

    expect(useCallStore.getState().voiceStates.ana).toMatchObject({
      muted: false,
      serverMuted: true,
      serverDeafened: false
    })
    expect(useCallStore.getState().serverCalls['canal-1'].participants[0]).toMatchObject({
      server_muted: true,
      server_deafened: false
    })
  })

  it('troca o microfone no meio da chamada sem sair da sala', async () => {
    const first = fakeStream('audio')
    const second = fakeStream('audio')
    rtc.getAudioStream.mockResolvedValueOnce(fakeMic(first)).mockResolvedValueOnce(fakeMic(second))
    await joinChannel()

    await useCallStore.getState().setInputDevice('mic-usb')

    expect(rtc.getAudioStream).toHaveBeenLastCalledWith('mic-usb')
    expect(media.instances[0].replaceMic).toHaveBeenCalledWith(second.getAudioTracks()[0])
    expect(allStopped(first)).toBe(true)
    expect(useCallStore.getState().inputDeviceId).toBe('mic-usb')
    expect(useCallStore.getState().status).toBe('active')
  })

  it('fecha o microfone inteiro (não só a track enviada) ao sair da chamada', async () => {
    const mic = fakeMic()
    rtc.getAudioStream.mockResolvedValueOnce(mic)
    await joinChannel()

    useCallStore.getState().endCall()

    expect(mic.stop).toHaveBeenCalledTimes(1)
  })

  it('fecha o microfone antigo ao trocar de dispositivo', async () => {
    const first = fakeMic()
    rtc.getAudioStream.mockResolvedValueOnce(first).mockResolvedValueOnce(fakeMic())
    await joinChannel()

    await useCallStore.getState().setInputDevice('mic-usb')

    expect(first.stop).toHaveBeenCalledTimes(1)
  })

  it('o microfone novo respeita o mute atual', async () => {
    const second = fakeStream('audio')
    rtc.getAudioStream.mockResolvedValueOnce(fakeMic()).mockResolvedValueOnce(fakeMic(second))
    await joinChannel()
    useCallStore.getState().toggleMute()

    await useCallStore.getState().setInputDevice('mic-usb')

    expect((second.getAudioTracks()[0] as unknown as FakeTrack).enabled).toBe(false)
  })

  it('entra na chamada já com o microfone escolhido', async () => {
    await useCallStore.getState().setInputDevice('mic-usb')
    await joinChannel()

    expect(rtc.getAudioStream).toHaveBeenLastCalledWith('mic-usb')
  })

  it('guarda a saída de áudio escolhida', () => {
    useCallStore.getState().setOutputDevice('fone')
    expect(useCallStore.getState().outputDeviceId).toBe('fone')
  })

  it('depois de trocar o microfone, reaplica o mute na sala (o SDK pode ter mutado sozinho)', async () => {
    rtc.getAudioStream.mockResolvedValueOnce(fakeMic()).mockResolvedValueOnce(fakeMic())
    await joinChannel()
    const connection = media.instances[0]
    connection.setMicMuted.mockClear()

    await useCallStore.getState().setInputDevice('')

    expect(connection.replaceMic).toHaveBeenCalled()
    expect(connection.setMicMuted).toHaveBeenLastCalledWith(false)
  })

  it('microfone salvo que sumiu: entra com o padrão do sistema em vez de falhar', async () => {
    await useCallStore.getState().setInputDevice('headset-desconectado')
    rtc.getAudioStream.mockImplementation(async (id?: string) => {
      if (id) throw Object.assign(new Error('x'), { name: 'OverconstrainedError' })
      return fakeMic()
    })

    await joinChannel()

    expect(useCallStore.getState().status).toBe('active')
    expect(useCallStore.getState().inputDeviceId).toBe('')
    expect(rtc.getAudioStream).toHaveBeenLastCalledWith('')
  })

  it('não avisa mudo/ensurdecido antes de a chamada estar ativa (DM tocando)', async () => {
    useCallStore.getState().handleWsEvent({
      type: 'call:invite',
      payload: {
        call_id: 'dm-1',
        type: 'dm',
        initiator: { id: 'ana', username: 'ana', display_name: 'Ana' }
      }
    })
    chat.sendEvent.mockClear()

    useCallStore.getState().toggleMute()

    expect(chat.sendEvent).not.toHaveBeenCalledWith('call:voice', expect.anything())
    expect(useCallStore.getState().status).toBe('idle')
  })

  it('ao conectar a mídia, avisa o estado atual de mudo/ensurdecido', async () => {
    const connected = deferred<void>()
    media.connect.mockReturnValue(connected.promise)
    await useCallStore.getState().startChannelCall('canal-1')
    useCallStore.getState().toggleDeafen()
    chat.sendEvent.mockClear()

    connected.resolve()
    await flush()
    await flush()

    expect(chat.sendEvent).toHaveBeenCalledWith('call:voice', {
      call_id: 'call-1',
      muted: true,
      deafened: true
    })
  })

  it('toca som ao entrar na chamada e ao sair', async () => {
    await joinChannel()
    expect(sounds.playSound).toHaveBeenCalledWith('join')

    useCallStore.getState().endCall()
    expect(sounds.playSound).toHaveBeenLastCalledWith('leave')
  })

  it('ao entrar, toca o meu som de entrada no lugar do "join" padrão', async () => {
    me.user = {
      id: 'eu',
      entrance_sound_url: '/api/entrance-sounds/0b6e7a52-3c1f-4c47-9d0e-2f6a8b1c4d5e'
    }
    try {
      await joinChannel()
      expect(entrance.playEntranceClip).toHaveBeenCalledTimes(1)
      expect(sounds.playSound).not.toHaveBeenCalledWith('join')
    } finally {
      me.user = { id: 'eu', entrance_sound_url: null }
    }
  })

  it('toca som quando alguém sai da minha chamada; o de entrada é do entranceSound', async () => {
    await joinChannel()
    const ana = { id: 'ana', username: 'ana', display_name: 'Ana' }

    useCallStore
      .getState()
      .handleWsEvent({ type: 'call:joined', payload: { call_id: 'call-1', user: ana } })
    // O som de quem entra (o personalizado ou o padrão) toca em
    // lib/entranceSoundListener: aqui não, senão tocariam os dois.
    expect(sounds.playSound).not.toHaveBeenCalledWith('userJoin')
    expect(useCallStore.getState().participants.some((p) => p.id === 'ana')).toBe(true)

    useCallStore
      .getState()
      .handleWsEvent({ type: 'call:left', payload: { call_id: 'call-1', user: ana } })
    expect(sounds.playSound).toHaveBeenLastCalledWith('userLeave')
  })

  it('toca som ao mutar/desmutar e ensurdecer/desensurdecer', async () => {
    await joinChannel()
    const play = sounds.playSound

    useCallStore.getState().toggleMute()
    expect(play).toHaveBeenLastCalledWith('mute')
    useCallStore.getState().toggleMute()
    expect(play).toHaveBeenLastCalledWith('unmute')
    useCallStore.getState().toggleDeafen()
    expect(play).toHaveBeenLastCalledWith('deafen')
    useCallStore.getState().toggleDeafen()
    expect(play).toHaveBeenLastCalledWith('undeafen')
  })

  it('não toca "alguém entrou" quando sou eu entrando', async () => {
    await joinChannel()
    sounds.playSound.mockClear()
    useCallStore.getState().handleWsEvent({
      type: 'call:joined',
      payload: { call_id: 'call-1', user: { id: 'eu', username: 'eu', display_name: 'Eu' } }
    })
    expect(sounds.playSound).not.toHaveBeenCalled()
  })
})

describe('callStore — atender DM', () => {
  function ringing(): void {
    useCallStore.getState().handleWsEvent({
      type: 'call:invite',
      payload: {
        call_id: 'dm-1',
        type: 'dm',
        initiator: { id: 'ana', username: 'ana', display_name: 'Ana' }
      }
    })
  }

  it('só pede o token depois de o servidor confirmar o aceite', async () => {
    const accepted = deferred<undefined>()
    api.acceptCall.mockReturnValueOnce(accepted.promise)
    ringing()

    const accepting = useCallStore.getState().acceptCall()
    await flush()
    expect(api.acceptCall).toHaveBeenCalledWith('dm-1')
    expect(api.getCallToken).not.toHaveBeenCalled()
    expect(chat.subscribeRoom).not.toHaveBeenCalled()
    expect(chat.sendEvent).not.toHaveBeenCalledWith('call:accept', expect.anything())
    // Ainda não sou participante: segue tocando (um call:voice agora seria recusado).
    expect(useCallStore.getState().status).toBe('idle')
    expect(useIncomingCallStore.getState().call?.callId).toBe('dm-1')

    accepted.resolve(undefined)
    await accepting
    await flush()
    expect(useCallStore.getState().status).toBe('active')
    expect(chat.subscribeRoom).toHaveBeenCalledWith('call:dm-1')
    expect(api.getCallToken).toHaveBeenCalledWith('dm-1')
  })

  it('403 no token é "sem permissão" na hora, sem tentar de novo', async () => {
    api.getCallToken.mockRejectedValueOnce(
      Object.assign(new ApiError(403, 'not allowed'), { status: 403 }) as never
    )
    ringing()

    await useCallStore.getState().acceptCall()
    await flush()
    await flush()

    expect(api.getCallToken).toHaveBeenCalledTimes(1)
    expect(useCallStore.getState().connection.phase).toBe('failed')
  })

  it('aceite recusado pelo servidor (a chamada acabou): avisa e volta ao ocioso, sem mídia', async () => {
    api.acceptCall.mockRejectedValueOnce(
      Object.assign(new ApiError(404, 'call not found'), { status: 404 }) as never
    )
    ringing()

    await useCallStore.getState().acceptCall()
    await flush()

    expect(showToast.error).toHaveBeenCalled()
    expect(useCallStore.getState().status).toBe('idle')
    expect(useIncomingCallStore.getState().call).toBeNull()
    expect(api.getCallToken).not.toHaveBeenCalled()
  })

  it('recusou enquanto o aceite ia ao servidor: sai da chamada que acabou de entrar', async () => {
    const accepted = deferred<undefined>()
    api.acceptCall.mockReturnValueOnce(accepted.promise)
    ringing()

    const accepting = useCallStore.getState().acceptCall()
    await flush()
    useCallStore.getState().declineCall()
    chat.sendEvent.mockClear()
    accepted.resolve(undefined)
    await accepting
    await flush()

    // O call:leave do desligar pode ter chegado antes do aceite: manda de novo.
    expect(chat.sendEvent).toHaveBeenCalledWith('call:leave', { call_id: 'dm-1' })
    expect(api.getCallToken).not.toHaveBeenCalled()
    expect(useCallStore.getState().status).toBe('idle')
  })

  it('convite com call ativa toca sem derrubar a call', async () => {
    await joinChannel()
    ringing()

    expect(useIncomingCallStore.getState().call?.callId).toBe('dm-1')
    expect(useCallStore.getState().status).toBe('active')
    expect(useCallStore.getState().callId).toBe('call-1')
  })

  it('aceitar estando em canal limpa a call local sem call:leave e entra na DM', async () => {
    await joinChannel()
    const oldMedia = media.instances[0]
    ringing()
    chat.sendEvent.mockClear()

    await useCallStore.getState().acceptCall()
    await flush()

    expect(chat.sendEvent).not.toHaveBeenCalledWith('call:leave', expect.anything())
    expect(oldMedia.disconnect).toHaveBeenCalled()
    expect(useIncomingCallStore.getState().call).toBeNull()
    const s = useCallStore.getState()
    expect([s.status, s.callId, s.type]).toEqual(['active', 'dm-1', 'dm'])
    expect(s.participants.map((p) => p.id)).toEqual(['ana'])
    expect(chat.subscribeRoom).toHaveBeenCalledWith('call:dm-1')
  })

  it('recusar mantém a call atual', async () => {
    await joinChannel()
    ringing()

    useCallStore.getState().declineCall()

    expect(chat.sendEvent).toHaveBeenCalledWith('call:decline', { call_id: 'dm-1' })
    expect(useIncomingCallStore.getState().call).toBeNull()
    expect([useCallStore.getState().status, useCallStore.getState().callId]).toEqual([
      'active',
      'call-1'
    ])
  })

  it('microfone falhando ao aceitar mantém a call atual', async () => {
    await joinChannel()
    ringing()
    rtc.getAudioStream.mockRejectedValueOnce(new Error('sem microfone'))

    await useCallStore.getState().acceptCall()

    expect(showToast.error).toHaveBeenCalled()
    expect(api.acceptCall).not.toHaveBeenCalled()
    expect([useCallStore.getState().status, useCallStore.getState().callId]).toEqual([
      'active',
      'call-1'
    ])
  })

  it('call:ended da chamada que toca limpa o convite', () => {
    ringing()
    useCallStore.getState().handleWsEvent({ type: 'call:ended', payload: { call_id: 'dm-1' } })
    expect(useIncomingCallStore.getState().call).toBeNull()
  })
})

describe('callStore — ligar estando numa call', () => {
  const ana = { id: 'ana', username: 'ana', display_name: 'Ana' }

  it('ligar estando em canal sai dele localmente e fica tocando', async () => {
    await joinChannel()
    const oldMedia = media.instances[0]
    api.startCall.mockResolvedValueOnce({ id: 'dm-9' })
    chat.sendEvent.mockClear()

    await useCallStore.getState().startDMCall('cv-1', ana)

    expect(chat.sendEvent).not.toHaveBeenCalledWith('call:leave', expect.anything())
    expect(oldMedia.disconnect).toHaveBeenCalled()
    const s = useCallStore.getState()
    expect([s.status, s.type, s.callId, s.conversationId]).toEqual([
      'outgoing',
      'dm',
      'dm-9',
      'cv-1'
    ])
    expect(chat.subscribeRoom).toHaveBeenCalledWith('call:dm-9')
  })

  it('ligar falhando mantém a call atual', async () => {
    await joinChannel()
    api.startCall.mockRejectedValueOnce(new Error('não deu'))

    await useCallStore.getState().startDMCall('cv-1', ana)

    expect(showToast.error).toHaveBeenCalledWith('não deu')
    expect([useCallStore.getState().status, useCallStore.getState().callId]).toEqual([
      'active',
      'call-1'
    ])
  })

  it('ligar de novo na conversa da call em andamento não faz nada', async () => {
    api.startCall.mockResolvedValueOnce({ id: 'dm-9' })
    await useCallStore.getState().startDMCall('cv-1', ana)
    api.startCall.mockClear()

    await useCallStore.getState().startDMCall('cv-1', ana)

    expect(api.startCall).not.toHaveBeenCalled()
    expect(useCallStore.getState().callId).toBe('dm-9')
  })
})

describe('callStore — reentrada após queda do WS', () => {
  const participant = (id: string): Record<string, unknown> => ({
    user_id: id,
    username: id,
    display_name: id.toUpperCase()
  })

  it('volta a entrar e recarrega a lista quando o backend me tira da chamada', async () => {
    await joinChannel()
    api.startCall.mockClear()
    const state = {
      call: null,
      participants: [participant('eu'), participant('ana'), participant('bia')]
    }
    // Primeiro confere que a chamada existe, depois lê a lista.
    api.getCallState.mockResolvedValueOnce(state as never).mockResolvedValueOnce(state as never)

    useCallStore.getState().handleWsEvent({
      type: 'call:left',
      payload: { call_id: 'call-1', user: { id: 'eu', username: 'eu', display_name: 'Eu' } }
    })
    await flush()
    await flush()

    expect(api.startCall).toHaveBeenCalledWith({ type: 'channel', channel_id: 'canal-1' })
    expect(useCallStore.getState().status).toBe('active')
    expect(useCallStore.getState().participants.map((p) => p.id)).toEqual(['ana', 'bia'])
  })

  it('reentra ao reconectar o WS e reanuncia a tela compartilhada', async () => {
    await joinChannel()
    rtc.getDisplayStream.mockResolvedValue(fakeStream('video'))
    await useCallStore.getState().startScreenShare()
    api.startCall.mockClear()
    chat.sendEvent.mockClear()

    useCallStore.getState().handleWsReconnect()
    await flush()
    await flush()

    expect(api.startCall).toHaveBeenCalledTimes(1)
    expect(chat.sendEvent).toHaveBeenCalledWith('call:screen', { call_id: 'call-1', active: true })
  })

  it('voltar à call depois de atualizar o app transmitindo não deixa a live fantasma (#367)', async () => {
    // O processo antigo fechou transmitindo e o novo reconectou dentro da
    // tolerância: o servidor ainda me lista como transmitindo.
    api.getCallState.mockResolvedValueOnce({
      call: null,
      participants: [],
      screen_sharing: ['eu', 'ana']
    } as never)
    await useCallStore.getState().startChannelCall('canal-1', {
      userId: 'eu',
      backendUrl: 'api',
      serverId: 's',
      channelId: 'canal-1',
      muted: false,
      deafened: false,
      mutedBeforeDeafen: false
    })
    await flush()

    expect(useCallStore.getState().isScreenSharing).toBe(false)
    expect(useCallStore.getState().screenSharers).toEqual(['ana'])
    expect(chat.sendEvent).toHaveBeenCalledWith('call:screen', { call_id: 'call-1', active: false })
  })

  it('entrar na call sem live no servidor não anuncia nada sobre a tela', async () => {
    api.getCallState.mockResolvedValueOnce({
      call: null,
      participants: [],
      screen_sharing: ['ana']
    } as never)
    await joinChannel()

    expect(useCallStore.getState().screenSharers).toEqual(['ana'])
    expect(chat.sendEvent).not.toHaveBeenCalledWith('call:screen', expect.anything())
  })

  it('reconectar o WS (deploy) não toca som nem reconecta a mídia', async () => {
    await joinChannel()
    sounds.playSound.mockClear()

    useCallStore.getState().handleWsReconnect()
    await flush()
    await flush()

    expect(sounds.playSound).not.toHaveBeenCalled()
    expect(media.instances).toHaveLength(1)
    expect(media.instances[0].disconnect).not.toHaveBeenCalled()
    expect(useCallStore.getState().status).toBe('active')
  })

  it('ao reconectar, reenvia o mudo e que não estou transmitindo (o servidor pode ter ficado velho)', async () => {
    await joinChannel()
    useCallStore.getState().toggleMute()
    chat.sendEvent.mockClear()

    useCallStore.getState().handleWsReconnect()
    await flush()
    await flush()

    expect(chat.sendEvent).toHaveBeenCalledWith('call:voice', {
      call_id: 'call-1',
      muted: true,
      deafened: false
    })
    expect(chat.sendEvent).toHaveBeenCalledWith('call:screen', { call_id: 'call-1', active: false })
  })

  it('ao reconectar, o mudo dos outros vem do servidor', async () => {
    await joinChannel()
    useCallStore.getState().handleWsEvent({
      type: 'call:voice',
      payload: { call_id: 'call-1', user_id: 'ana', muted: false, deafened: false }
    })
    // Na queda, a ana mutou e o evento se perdeu.
    const state = {
      call: null,
      participants: [participant('eu'), { ...participant('ana'), muted: true }]
    }
    api.getCallState.mockResolvedValueOnce(state as never).mockResolvedValueOnce(state as never)

    useCallStore.getState().handleWsReconnect()
    await flush()
    await flush()

    expect(useCallStore.getState().voiceStates.ana).toMatchObject({ muted: true, deafened: false })
  })

  it('canal: 404 ao reconectar não cria chamada nova enquanto há gente na sala de mídia', async () => {
    await joinChannel()
    onRemoteMedia({ ...empty, mediaPeers: { ana: 'Ana' } })
    api.startCall.mockClear()
    vi.useFakeTimers()
    try {
      api.getCallState.mockRejectedValue(
        Object.assign(new ApiError(404, 'call not found'), { status: 404 }) as never
      )

      useCallStore.getState().handleWsReconnect()
      await vi.advanceTimersByTimeAsync(10_000)

      expect(api.startCall).not.toHaveBeenCalled()
      expect(media.instances[0].disconnect).not.toHaveBeenCalled()
      expect(useCallStore.getState().callId).toBe('call-1')
    } finally {
      api.getCallState.mockReset()
      api.getCallState.mockImplementation(async () => ({ call: null, participants: [] }))
      vi.useRealTimers()
    }
  })

  it('canal: 404 ao reconectar (sala de mídia vazia) segue na chamada nova na hora, sem sondar de novo', async () => {
    await joinChannel()
    api.startCall.mockClear()
    api.getCallState.mockClear()
    api.getCallState.mockRejectedValueOnce(
      Object.assign(new ApiError(404, 'call not found'), { status: 404 }) as never
    )
    api.startCall.mockResolvedValueOnce({ id: 'call-2' })

    useCallStore.getState().handleWsReconnect()
    await flush()
    await flush()

    // O servidor só atende depois de recarregar as chamadas: o 404 é de verdade.
    expect(api.startCall).toHaveBeenCalledTimes(1)
    expect(useCallStore.getState().callId).toBe('call-2')
    expect(media.instances[0].disconnect).toHaveBeenCalled()
    expect(api.getCallState).toHaveBeenNthCalledWith(1, 'call-1')
    const probes = (api.getCallState.mock.calls as unknown[][]).filter((c) => c[0] === 'call-1')
    expect(probes).toHaveLength(1)
  })

  it('não faz nada ao reconectar o WS fora de chamada', async () => {
    useCallStore.getState().handleWsReconnect()
    await flush()
    expect(api.startCall).not.toHaveBeenCalled()
  })

  it('guarda quem está na sala de mídia mesmo fora da lista do backend', async () => {
    await joinChannel()
    const onRemoteMedia = (media.instances[0].handlers as { onRemoteMedia: (m: unknown) => void })
      .onRemoteMedia
    onRemoteMedia({
      streams: {},
      screenStreams: {},
      screenAudioStreams: {},
      videoStreams: {},
      mediaPeers: { caio: 'Caio' }
    })
    expect(useCallStore.getState().mediaPeers).toEqual({ caio: 'Caio' })
  })
})

describe('callStore — DM após queda do WS', () => {
  const ana = { id: 'ana', username: 'ana', display_name: 'Ana' }

  async function inDmWithAna(): Promise<void> {
    api.startCall.mockResolvedValue({ id: 'dm-1' })
    await useCallStore.getState().startDMCall('conversa-1', ana)
    useCallStore.getState().handleWsEvent({
      type: 'call:accept',
      payload: { call_id: 'dm-1', user: ana }
    })
    await flush()
    await flush()
  }

  it('reenvia mudo e tela e lê o estado, sem reconectar a mídia nem tirar a outra pessoa', async () => {
    await inDmWithAna()
    expect(useCallStore.getState().status).toBe('active')
    useCallStore.getState().toggleMute()
    chat.sendEvent.mockClear()
    api.getCallState.mockClear()
    api.getCallState.mockResolvedValueOnce({
      call: null,
      participants: [{ user_id: 'eu' }, { user_id: 'ana', username: 'ana', deafened: true }]
    } as never)

    useCallStore.getState().handleWsReconnect()
    await flush()
    await flush()

    expect(api.getCallState).toHaveBeenCalledWith('dm-1')
    expect(chat.sendEvent).toHaveBeenCalledWith('call:voice', {
      call_id: 'dm-1',
      muted: true,
      deafened: false
    })
    expect(chat.sendEvent).toHaveBeenCalledWith('call:screen', { call_id: 'dm-1', active: false })
    expect(useCallStore.getState().voiceStates.ana).toMatchObject({ muted: false, deafened: true })
    expect(useCallStore.getState().participants.map((p) => p.id)).toEqual(['ana'])
    expect(media.instances).toHaveLength(1)
    expect(api.startCall).toHaveBeenCalledTimes(1)
  })

  const notFound = (): Error => Object.assign(new ApiError(404, 'call not found'), { status: 404 })

  it('DM que acabou durante a queda fecha na hora (404 e a outra pessoa fora da mídia)', async () => {
    await inDmWithAna()
    api.getCallState.mockClear()
    api.getCallState.mockRejectedValueOnce(notFound() as never)

    useCallStore.getState().handleWsReconnect()
    await flush()
    await flush()

    expect(useCallStore.getState().status).toBe('idle')
    expect(useCallStore.getState().callId).toBeNull()
    expect(api.getCallState).toHaveBeenCalledTimes(1)
  })

  it('404 mas a outra pessoa ainda na sala de mídia: a DM continua', async () => {
    await inDmWithAna()
    onRemoteMedia({ ...empty, mediaPeers: { ana: 'Ana' } })
    vi.useFakeTimers()
    try {
      api.getCallState.mockRejectedValue(notFound() as never)

      useCallStore.getState().handleWsReconnect()
      await vi.advanceTimersByTimeAsync(10_000)

      expect(useCallStore.getState().status).toBe('active')
      expect(media.instances[0].disconnect).not.toHaveBeenCalled()
    } finally {
      api.getCallState.mockReset()
      api.getCallState.mockImplementation(async () => ({ call: null, participants: [] }))
      vi.useRealTimers()
    }
  })

  it('erro passageiro ao ler o estado mantém a DM', async () => {
    await inDmWithAna()
    api.getCallState.mockRejectedValueOnce(new Error('rede') as never)

    useCallStore.getState().handleWsReconnect()
    await flush()
    await flush()

    expect(useCallStore.getState().status).toBe('active')
  })
})

describe('callStore — transmissões sob demanda', () => {
  /** ana transmitindo e eu assistindo, com o vídeo dela já chegando. */
  async function watchingAna(): Promise<void> {
    await joinChannel()
    onRemoteMedia({ ...empty, availableScreens: ['ana'] })
    useCallStore.getState().watchScreen('ana')
    onRemoteMedia({
      ...empty,
      availableScreens: ['ana'],
      screenStreams: { ana: fakeStream('video') }
    })
  }

  it('transmissão nova começa pausada: sem foco e sem pedir a mídia', async () => {
    await joinChannel()

    onRemoteMedia({ ...empty, availableScreens: ['ana'] })

    const s = useCallStore.getState()
    expect(s.focusedScreenUserId).toBeNull()
    expect(s.watchedScreenIds).toEqual([])
    expect(s.availableScreens).toEqual(['ana'])
    expect(media.setWatchedScreens).not.toHaveBeenCalledWith(['ana'])
  })

  it('assistir foca a transmissão e pede a mídia dela', async () => {
    await joinChannel()
    onRemoteMedia({ ...empty, availableScreens: ['ana'] })

    useCallStore.getState().watchScreen('ana')

    expect(useCallStore.getState().watchedScreenIds).toEqual(['ana'])
    expect(useCallStore.getState().focusedScreenUserId).toBe('ana')
    expect(media.setWatchedScreens).toHaveBeenLastCalledWith(['ana'])
  })

  it('não assiste quem não está transmitindo', async () => {
    await joinChannel()

    useCallStore.getState().watchScreen('ana')

    expect(useCallStore.getState().watchedScreenIds).toEqual([])
    expect(media.setWatchedScreens).not.toHaveBeenCalled()
  })

  it('mantém o foco enquanto a transmissão assistida ainda não chegou', async () => {
    await joinChannel()
    onRemoteMedia({ ...empty, availableScreens: ['ana'] })
    useCallStore.getState().watchScreen('ana')

    onRemoteMedia({ ...empty, availableScreens: ['ana'], streams: { bia: fakeStream('audio') } })

    expect(useCallStore.getState().focusedScreenUserId).toBe('ana')
  })

  it('respeita quem saiu do modo foco mesmo com novos eventos de mídia', async () => {
    await watchingAna()

    useCallStore.getState().setFocusedScreenUser(null)
    onRemoteMedia({
      ...empty,
      availableScreens: ['ana'],
      screenStreams: { ana: fakeStream('video') },
      streams: { bia: fakeStream('audio') }
    })

    expect(useCallStore.getState().focusedScreenUserId).toBeNull()
    expect(useCallStore.getState().watchedScreenIds).toEqual(['ana'])
  })

  it('reconexão da sala não fecha a transmissão que estou assistindo', async () => {
    await watchingAna()

    // Na reconexão completa os participantes somem por um instante.
    onRemoteMedia({ ...empty, reconnecting: true })
    expect(useCallStore.getState().watchedScreenIds).toEqual(['ana'])
    expect(useCallStore.getState().focusedScreenUserId).toBe('ana')

    onRemoteMedia({
      ...empty,
      availableScreens: ['ana'],
      screenStreams: { ana: fakeStream('video') }
    })
    expect(useCallStore.getState().watchedScreenIds).toEqual(['ana'])
    expect(useCallStore.getState().focusedScreenUserId).toBe('ana')
  })

  it('quem parou de transmitir durante a reconexão é podado depois dela', async () => {
    await watchingAna()

    onRemoteMedia({ ...empty, reconnecting: true })
    onRemoteMedia(empty)

    expect(useCallStore.getState().watchedScreenIds).toEqual([])
    expect(useCallStore.getState().focusedScreenUserId).toBeNull()
  })

  it('fechar a transmissão para de baixar e volta ao card', async () => {
    await watchingAna()

    useCallStore.getState().stopWatchingScreen('ana')

    expect(useCallStore.getState().watchedScreenIds).toEqual([])
    expect(useCallStore.getState().focusedScreenUserId).toBeNull()
    expect(media.setWatchedScreens).toHaveBeenLastCalledWith([])
  })

  it('quem para de transmitir e volta começa pausado de novo', async () => {
    await watchingAna()

    onRemoteMedia(empty)
    expect(useCallStore.getState().watchedScreenIds).toEqual([])
    expect(useCallStore.getState().focusedScreenUserId).toBeNull()

    onRemoteMedia({ ...empty, availableScreens: ['ana'] })
    expect(useCallStore.getState().watchedScreenIds).toEqual([])
    expect(useCallStore.getState().focusedScreenUserId).toBeNull()
  })

  it('sair da chamada fecha a transmissão', async () => {
    await watchingAna()

    useCallStore.getState().endCall()

    const s = useCallStore.getState()
    expect(s.watchedScreenIds).toEqual([])
    expect(s.availableScreens).toEqual([])
    expect(s.focusedScreenUserId).toBeNull()
  })

  it('call:screen de outra pessoa não abre foco', async () => {
    await joinChannel()

    useCallStore.getState().handleWsEvent({
      type: 'call:screen',
      payload: {
        call_id: 'call-1',
        user: { id: 'ana', username: 'ana', display_name: 'Ana' },
        active: true
      }
    })

    expect(useCallStore.getState().focusedScreenUserId).toBeNull()
    expect(useCallStore.getState().screenSharers).toContain('ana')
  })

  it('entrar numa call com alguém transmitindo não abre foco', async () => {
    api.getCallState.mockResolvedValueOnce({
      call: null,
      participants: [],
      screen_sharing: ['ana']
    } as never)

    await joinChannel()

    expect(useCallStore.getState().focusedScreenUserId).toBeNull()
    expect(useCallStore.getState().screenSharers).toEqual(['ana'])
  })
})

describe('callStore — miniatura da transmissão', () => {
  it('guarda o servidor da chamada de canal', async () => {
    api.startCall.mockResolvedValue({ id: 'call-1', server_id: 'srv-1' })
    await joinChannel()
    expect(useCallStore.getState().serverId).toBe('srv-1')

    useCallStore.getState().endCall()
    expect(useCallStore.getState().serverId).toBeNull()
  })

  it('clicar na miniatura volta à call com a transmissão em destaque', async () => {
    await joinChannel()
    onRemoteMedia({
      ...empty,
      availableScreens: ['ana'],
      screenStreams: { ana: fakeStream('video') }
    })
    useCallStore.getState().watchScreen('ana')
    useCallStore.getState().setDmMinimized(true)
    useCallStore.getState().setFocusedScreenUser(null)

    useCallStore.getState().focusWatchedScreen('ana')

    expect(useCallStore.getState().focusedScreenUserId).toBe('ana')
    expect(useCallStore.getState().dmMinimized).toBe(false)
  })

  it('fora da tela da call só a transmissão da miniatura continua', async () => {
    await joinChannel()
    const screens = { ana: fakeStream('video'), bia: fakeStream('video') }
    onRemoteMedia({ ...empty, availableScreens: ['ana', 'bia'], screenStreams: screens })
    useCallStore.getState().watchScreen('ana')
    useCallStore.getState().watchScreen('bia')
    useCallStore.getState().setFocusedScreenUser('ana')
    useCallStore.getState().setStageVisible(true)

    useCallStore.getState().setStageVisible(false)

    expect(useCallStore.getState().watchedScreenIds).toEqual(['ana'])
    expect(useCallStore.getState().focusedScreenUserId).toBe('ana')
    expect(media.setWatchedScreens).toHaveBeenLastCalledWith(['ana'])
  })

  it('a transmissão fora da miniatura que estava em destaque cede o foco', async () => {
    await joinChannel()
    onRemoteMedia({
      ...empty,
      availableScreens: ['ana', 'bia'],
      screenStreams: { bia: fakeStream('video') }
    })
    useCallStore.getState().watchScreen('bia')
    useCallStore.getState().watchScreen('ana')
    useCallStore.getState().setStageVisible(true)

    // Foco em ana, mas só bia tem vídeo: a miniatura mostra bia.
    useCallStore.getState().setStageVisible(false)

    expect(useCallStore.getState().watchedScreenIds).toEqual(['bia'])
    expect(useCallStore.getState().focusedScreenUserId).toBe('bia')
  })

  it('miniatura não foca transmissão que não estou assistindo', async () => {
    await joinChannel()
    onRemoteMedia({ ...empty, availableScreens: ['bia'] })

    useCallStore.getState().focusWatchedScreen('bia')

    expect(useCallStore.getState().focusedScreenUserId).toBeNull()
  })
})

describe('callStore — prévia da transmissão no perfil', () => {
  it('manda a foto da própria tela só quando o servidor pede e estou transmitindo', async () => {
    let t = 1_000_000
    const now = vi.spyOn(Date, 'now').mockImplementation(() => (t += 10_000))
    try {
      await joinChannel()
      const request = (callId: string): void =>
        useCallStore.getState().handleWsEvent({
          type: 'call:screen_preview_request',
          payload: { call_id: callId }
        } as never)

      // Sem transmitir: nada.
      request('call-1')
      await flush()
      expect(snapshot.captureScreenPreview).not.toHaveBeenCalled()

      const stream = fakeStream('video')
      rtc.getDisplayStream.mockResolvedValueOnce(stream)
      await useCallStore.getState().startScreenShare()

      // Pedido de outra chamada: nada.
      request('outra')
      await flush()
      expect(snapshot.captureScreenPreview).not.toHaveBeenCalled()

      request('call-1')
      await flush()
      expect(snapshot.captureScreenPreview).toHaveBeenCalledWith(stream)
      expect(api.putScreenPreview).toHaveBeenCalledWith('call-1', 'FOTO')
    } finally {
      now.mockRestore()
    }
  })
})

describe('callStore — selo LIVE', () => {
  it('call:live atualiza o selo da lista do servidor mesmo fora da call', () => {
    useCallStore.getState().setServerCalls('s1', {
      'canal-1': { call: { id: 'call-9' } as never, participants: [] }
    })

    useCallStore.getState().handleWsEvent({
      type: 'call:live',
      payload: { call_id: 'call-9', user_id: 'ana', active: true }
    })
    expect(useCallStore.getState().serverCalls['canal-1'].screen_sharing).toEqual(['ana'])

    useCallStore.getState().handleWsEvent({
      type: 'call:live',
      payload: { call_id: 'call-9', user_id: 'ana', active: false }
    })
    expect(useCallStore.getState().serverCalls['canal-1'].screen_sharing).toEqual([])
  })
})

describe('callStore — selo LIVE em dia', () => {
  it('lista lida com atraso não apaga um call:live recém-chegado', () => {
    useCallStore.getState().setServerCalls('s1', {
      'canal-2': { call: { id: 'call-7' } as never, participants: [] }
    })
    useCallStore.getState().handleWsEvent({
      type: 'call:live',
      payload: { call_id: 'call-7', user_id: 'bia', active: true }
    })

    // Resposta de uma leitura que saiu antes do evento.
    useCallStore.getState().setServerCalls('s1', {
      'canal-2': { call: { id: 'call-7' } as never, participants: [], screen_sharing: [] }
    })

    expect(useCallStore.getState().serverCalls['canal-2'].screen_sharing).toEqual(['bia'])
  })
})

describe('callStore — lista dos canais de voz pelos eventos do servidor', () => {
  const callInfo = { id: 'call-5', type: 'channel', channel_id: 'canal-5', server_id: 's2' }
  const person = (user_id: string): object => ({
    call_id: 'call-5',
    user_id,
    role: 'member',
    joined_at: ''
  })

  it('entrar, sair e o fim da chamada mudam a lista sem ler o servidor', () => {
    const event = (type: string, payload: object): void =>
      useCallStore.getState().handleWsEvent({ type, payload })

    event('call:channel_joined', { call: callInfo, participant: person('ana') })
    event('call:channel_joined', { call: callInfo, participant: person('bia') })
    const ids = (): string[] =>
      useCallStore.getState().serverCalls['canal-5'].participants.map((p) => p.user_id)
    expect(ids()).toEqual(['ana', 'bia'])

    event('call:channel_left', { call_id: 'call-5', channel_id: 'canal-5', user_id: 'ana' })
    expect(ids()).toEqual(['bia'])

    event('call:channel_ended', { call_id: 'call-5', channel_id: 'canal-5' })
    expect(useCallStore.getState().serverCalls['canal-5']).toBeUndefined()
    expect(api.getCallState).not.toHaveBeenCalled()
  })

  it('a lista lida de um servidor não apaga a dos outros', () => {
    useCallStore.getState().handleWsEvent({
      type: 'call:channel_joined',
      payload: { call: callInfo, participant: person('ana') }
    })

    useCallStore.getState().setServerCalls('s1', {})

    expect(useCallStore.getState().serverCalls['canal-5'].participants).toHaveLength(1)
  })
})

describe('callStore — movido de canal por um moderador', () => {
  it('trocar de chamada fecha a transmissão que eu assistia, como sair da call', async () => {
    await joinChannel()
    onRemoteMedia({
      ...empty,
      availableScreens: ['ana'],
      screenStreams: { ana: fakeStream('video') }
    })
    useCallStore.getState().watchScreen('ana')
    api.startCall.mockResolvedValue({ id: 'call-2', server_id: 'srv-1' })

    useCallStore.getState().handleWsEvent({
      type: 'call:moved',
      payload: {
        from_call_id: 'call-1',
        channel_id: 'canal-2',
        channel_name: 'Outro',
        user: { id: 'eu', username: 'eu', display_name: 'Eu' },
        moved_by: { id: 'mod', username: 'mod', display_name: 'Mod' }
      }
    })
    await flush()
    await flush()

    const s = useCallStore.getState()
    expect(s.callId).toBe('call-2')
    expect(s.watchedScreenIds).toEqual([])
    expect(s.availableScreens).toEqual([])
    expect(s.focusedScreenUserId).toBeNull()
  })
})

describe('callStore — detecção local da própria fala', () => {
  const speakers = (i = 0): ((ids: string[]) => void) =>
    (media.instances[i].handlers as { onActiveSpeakers: (ids: string[]) => void }).onActiveSpeakers

  it('começa ao entrar na chamada, no microfone publicado', async () => {
    const mic = fakeMic()
    rtc.getAudioStream.mockResolvedValueOnce(mic)
    await joinChannel()

    expect(vad.watches).toHaveLength(1)
    expect(vad.watches[0].mic).toBe(mic)
    expect(media.connect).toHaveBeenCalledWith(
      'ws://servidor',
      'tok',
      mic.stream.getAudioTracks()[0],
      false
    )
  })

  it('o próprio anel vem só da detecção local; os outros, do servidor', async () => {
    await joinChannel()
    const watch = vad.watches[0]

    watch.handlers.onChange(true)
    expect(useCallStore.getState().speakingIds).toEqual(['eu'])

    // O servidor atrasado ainda me lista: não segura o anel.
    watch.handlers.onChange(false)
    speakers()(['eu', 'ana'])
    expect(useCallStore.getState().speakingIds).toEqual(['ana'])

    watch.handlers.onChange(true)
    expect(useCallStore.getState().speakingIds).toEqual(['ana', 'eu'])
  })

  it('reinicia no microfone novo ao trocar de dispositivo e ignora o antigo', async () => {
    const first = fakeMic()
    const second = fakeMic()
    rtc.getAudioStream.mockResolvedValueOnce(first).mockResolvedValueOnce(second)
    await joinChannel()
    const old = vad.watches[0]

    await useCallStore.getState().setInputDevice('mic-usb')

    expect(old.stop).toHaveBeenCalledTimes(1)
    expect(vad.watches).toHaveLength(2)
    expect(vad.watches[1].mic).toBe(second)
    // Callback atrasado do watch parado não acende nada.
    old.handlers.onChange(true)
    expect(useCallStore.getState().speakingIds).toEqual([])
    vad.watches[1].handlers.onChange(true)
    expect(useCallStore.getState().speakingIds).toEqual(['eu'])
  })

  it('para ao sair da chamada e não reacende com callback atrasado', async () => {
    await joinChannel()
    const watch = vad.watches[0]
    watch.handlers.onChange(true)

    useCallStore.getState().endCall()

    expect(watch.stop).toHaveBeenCalledTimes(1)
    watch.handlers.onChange(true)
    expect(useCallStore.getState().speakingIds).toEqual([])
  })

  it('para quando o servidor manda call:error da chamada', async () => {
    await joinChannel()
    const watch = vad.watches[0]

    useCallStore.getState().handleWsEvent({
      type: 'call:error',
      payload: { call_id: 'call-1', message: 'erro' }
    })

    expect(watch.stop).toHaveBeenCalledTimes(1)
    expect(useCallStore.getState().status).toBe('idle')
  })

  it('DM: não começa enquanto só toca; começa ao aceitar e para ao desligar', async () => {
    const invite = (): void =>
      useCallStore.getState().handleWsEvent({
        type: 'call:invite',
        payload: {
          call_id: 'dm-1',
          type: 'dm',
          initiator: { id: 'ana', username: 'ana', display_name: 'Ana' }
        }
      })
    invite()
    expect(useIncomingCallStore.getState().call?.callId).toBe('dm-1')
    useCallStore.getState().declineCall()
    expect(vad.watches).toHaveLength(0)

    invite()
    await useCallStore.getState().acceptCall()
    await flush()
    await flush()
    expect(vad.watches).toHaveLength(1)
    useCallStore.getState().endCall()
    expect(vad.watches[0].stop).toHaveBeenCalledTimes(1)
  })

  it('mudo nunca está falando, nem com a detecção local acesa', async () => {
    await joinChannel()
    vad.watches[0].handlers.onChange(true)

    useCallStore.getState().toggleMute()
    expect(useCallStore.getState().speakingIds).toEqual([])
    // Ainda mudo: nem a detecção local nem o servidor acendem.
    vad.watches[0].handlers.onChange(true)
    speakers()(['eu'])
    expect(useCallStore.getState().speakingIds).toEqual([])

    useCallStore.getState().toggleMute()
    expect(useCallStore.getState().speakingIds).toEqual(['eu'])
  })

  it('ensurdecido nunca está falando', async () => {
    await joinChannel()
    vad.watches[0].handlers.onChange(true)

    useCallStore.getState().toggleDeafen()
    expect(useCallStore.getState().speakingIds).toEqual([])
    vad.watches[0].handlers.onChange(true)
    expect(useCallStore.getState().speakingIds).toEqual([])
  })

  it('sem detecção local, mutar esconde o próprio anel que o servidor ainda mostra', async () => {
    await joinChannel()
    vad.watches[0].handlers.onUnavailable()
    speakers()(['eu', 'ana'])
    expect(useCallStore.getState().speakingIds).toEqual(['eu', 'ana'])

    useCallStore.getState().toggleMute()
    expect(useCallStore.getState().speakingIds).toEqual(['ana'])
    speakers()(['eu', 'ana'])
    expect(useCallStore.getState().speakingIds).toEqual(['ana'])
  })

  it('movido por moderador: troca o watch e aplica o mute de antes ao anel', async () => {
    await joinChannel()
    const old = vad.watches[0]
    useCallStore.getState().toggleMute()
    api.startCall.mockResolvedValue({ id: 'call-2', server_id: 'srv-1' })
    const state = deferred<{ call: null; participants: never[] }>()
    api.getCallState.mockReturnValueOnce(state.promise)

    useCallStore.getState().handleWsEvent({
      type: 'call:moved',
      payload: {
        from_call_id: 'call-1',
        channel_id: 'canal-2',
        channel_name: 'Outro',
        user: { id: 'eu', username: 'eu', display_name: 'Eu' },
        moved_by: { id: 'mod', username: 'mod', display_name: 'Mod' }
      }
    })
    await flush()
    await flush()

    expect(old.stop).toHaveBeenCalledTimes(1)
    expect(vad.watches).toHaveLength(2)
    // Entre entrar na sala nova e reaplicar o mute, o servidor me lista.
    vad.watches[1].handlers.onUnavailable()
    speakers(1)(['eu'])
    expect(useCallStore.getState().speakingIds).toEqual(['eu'])

    state.resolve({ call: null, participants: [] })
    await flush()
    await flush()
    expect(useCallStore.getState().muted).toBe(true)
    expect(useCallStore.getState().speakingIds).toEqual([])
  })
})

// ─── Permissões de voz (cargos) ─────────────────────────────────────────────

const mediaHandlers = (): {
  onPublishPermissions: (allowed: { microphone: boolean; stream: boolean }) => void
} => media.instances[0].handlers as never

describe('callStore — permissões de voz', () => {
  it('começa podendo falar e transmitir', async () => {
    await joinChannel()
    expect(useCallStore.getState()).toMatchObject({ canSpeak: true, canStream: true })
  })

  it('perder a permissão de falar muda para mudo e avisa a chamada', async () => {
    await joinChannel()
    chat.sendEvent.mockClear()

    mediaHandlers().onPublishPermissions({ microphone: false, stream: true })

    expect(useCallStore.getState()).toMatchObject({ canSpeak: false, muted: true, canStream: true })
    expect(chat.sendEvent).toHaveBeenLastCalledWith('call:voice', {
      call_id: 'call-1',
      muted: true,
      deafened: false
    })
  })

  it('sem permissão de falar não dá para desmutar', async () => {
    await joinChannel()
    mediaHandlers().onPublishPermissions({ microphone: false, stream: true })
    vi.mocked(showToast.error).mockClear()

    useCallStore.getState().toggleMute()

    expect(useCallStore.getState().muted).toBe(true)
    expect(showToast.error).toHaveBeenCalledWith(expect.stringMatching(/permissão para falar/))
  })

  it('silenciado por moderador explica o motivo certo', async () => {
    await joinChannel()
    useCallStore.getState().handleWsEvent({
      type: 'call:voice',
      payload: {
        call_id: 'call-1',
        user_id: 'eu',
        muted: true,
        deafened: false,
        server_muted: true,
        server_deafened: false
      }
    })
    mediaHandlers().onPublishPermissions({ microphone: false, stream: true })
    vi.mocked(showToast.error).mockClear()

    useCallStore.getState().toggleMute()

    expect(showToast.error).toHaveBeenCalledWith(expect.stringMatching(/moderador/))
  })

  it('perdeu a fala sem querer (moderador silenciou) e foi liberado: volta a falar sozinho', async () => {
    await joinChannel()
    mediaHandlers().onPublishPermissions({ microphone: false, stream: true })
    expect(useCallStore.getState().muted).toBe(true)
    chat.sendEvent.mockClear()

    mediaHandlers().onPublishPermissions({ microphone: true, stream: true })

    expect(useCallStore.getState()).toMatchObject({ canSpeak: true, muted: false })
    expect(media.instances[0].ensureMic).toHaveBeenLastCalledWith(false)
    expect(chat.sendEvent).toHaveBeenLastCalledWith('call:voice', {
      call_id: 'call-1',
      muted: false,
      deafened: false
    })
  })

  it('já estava mudo por escolha quando foi silenciado: liberar não abre o microfone', async () => {
    await joinChannel()
    useCallStore.getState().toggleMute()
    mediaHandlers().onPublishPermissions({ microphone: false, stream: true })

    mediaHandlers().onPublishPermissions({ microphone: true, stream: true })

    expect(useCallStore.getState().muted).toBe(true)
  })

  it('mutou por conta própria depois de liberado: um novo silêncio e liberação respeitam o mute', async () => {
    await joinChannel()
    mediaHandlers().onPublishPermissions({ microphone: false, stream: true })
    mediaHandlers().onPublishPermissions({ microphone: true, stream: true })
    useCallStore.getState().toggleMute()
    expect(useCallStore.getState().muted).toBe(true)

    mediaHandlers().onPublishPermissions({ microphone: false, stream: true })
    mediaHandlers().onPublishPermissions({ microphone: true, stream: true })

    expect(useCallStore.getState().muted).toBe(true)
  })

  it('sem permissão de transmitir, tela e câmera nem abrem', async () => {
    await joinChannel()
    mediaHandlers().onPublishPermissions({ microphone: true, stream: false })
    vi.mocked(showToast.error).mockClear()

    await useCallStore.getState().startScreenShare()
    await useCallStore.getState().toggleCamera()

    expect(rtc.getDisplayStream).not.toHaveBeenCalled()
    expect(rtc.getCameraStream).not.toHaveBeenCalled()
    expect(showToast.error).toHaveBeenCalledTimes(2)
    expect(showToast.error).toHaveBeenCalledWith(expect.stringMatching(/transmitir/))
  })

  it('desconectado por um moderador: avisa e encerra a chamada', async () => {
    await joinChannel()
    const handlers = media.instances[0].handlers as { onRemovedByModerator: () => void }

    handlers.onRemovedByModerator()

    expect(showToast.info).toHaveBeenCalledWith(expect.stringMatching(/moderador desconectou/))
    expect(useCallStore.getState().status).toBe('idle')
  })

  it('sair da chamada devolve as permissões ao padrão', async () => {
    await joinChannel()
    mediaHandlers().onPublishPermissions({ microphone: false, stream: false })

    useCallStore.getState().endCall()

    expect(useCallStore.getState()).toMatchObject({ canSpeak: true, canStream: true })
  })
})

describe('callStore — salas trancadas e pedidos de entrada', () => {
  it('toggleLock envia evento call:lock com inversão do estado atual', async () => {
    await joinChannel()
    expect(useCallStore.getState().locked).toBe(false)

    useCallStore.getState().toggleLock()
    expect(chat.sendEvent).toHaveBeenCalledWith('call:lock', {
      call_id: 'call-1',
      locked: true
    })
  })

  it('evento call:lock atualiza o estado local e serverCalls', () => {
    useCallStore.getState().setServerCalls('s1', {
      'canal-1': {
        call: {
          id: 'call-1',
          type: 'channel',
          channel_id: 'canal-1',
          initiator_id: 'ana',
          status: 'active',
          started_at: '',
          locked: false
        },
        participants: []
      }
    })

    useCallStore.getState().handleWsEvent({
      type: 'call:lock',
      payload: {
        call_id: 'call-1',
        channel_id: 'canal-1',
        locked: true,
        by: { id: 'ana', username: 'ana', display_name: 'Ana' }
      }
    })

    expect(useCallStore.getState().serverCalls['canal-1']?.call?.locked).toBe(true)
  })

  it('receber call:knock adiciona participante aos joinRequests', async () => {
    await joinChannel()
    const joao = { id: 'joao', username: 'joao', display_name: 'João' }

    useCallStore.getState().handleWsEvent({
      type: 'call:knock',
      payload: {
        call_id: 'call-1',
        user: joao
      }
    })

    expect(useCallStore.getState().joinRequests).toEqual([joao])

    // call:knock_resolved remove o usuário de joinRequests
    useCallStore.getState().handleWsEvent({
      type: 'call:knock_resolved',
      payload: {
        call_id: 'call-1',
        user_id: 'joao',
        accepted: true,
        reason: 'accepted'
      }
    })

    expect(useCallStore.getState().joinRequests).toEqual([])
  })

  describe('som do pedido para entrar na sala trancada', () => {
    const knock = {
      call_id: 'call-1',
      user: { id: 'joao', username: 'joao', display_name: 'João' }
    }

    it('toca a batida quando estou ouvindo', async () => {
      await joinChannel()
      useCallStore.getState().handleWsEvent({ type: 'call:knock', payload: knock })
      expect(sounds.playSound).toHaveBeenCalledWith('knock')
    })

    it('ensurdecido: não toca a batida, mas o pedido continua na tela', async () => {
      await joinChannel()
      useCallStore.setState({ deafened: true })
      useCallStore.getState().handleWsEvent({ type: 'call:knock', payload: knock })
      expect(sounds.playSound).not.toHaveBeenCalledWith('knock')
      expect(useCallStore.getState().joinRequests).toHaveLength(1)
    })
  })

  it('call:knock_accepted conecta automaticamente ao canal', async () => {
    useCallStore.setState({
      knock: { channelId: 'canal-trancado', callId: 'call-x', status: 'pending' }
    })
    api.startCall.mockResolvedValue({ id: 'call-x', server_id: 'srv-1', locked: true })

    useCallStore.getState().handleWsEvent({
      type: 'call:knock_accepted',
      payload: {
        call_id: 'call-x',
        channel_id: 'canal-trancado',
        server_id: 'srv-1',
        reason: 'accepted',
        by: { id: 'mod', username: 'mod', display_name: 'Mod' }
      }
    })

    await flush()
    await flush()

    expect(useCallStore.getState().knock).toBeNull()
    expect(useCallStore.getState().callId).toBe('call-x')
    expect(useCallStore.getState().admittedChannelId).toBe('canal-trancado')
  })

  describe('espectadores da transmissão (screenWatchers)', () => {
    it('watchScreen envia call:screen_watch e stopWatchingScreen cancela', async () => {
      await joinChannel()
      onRemoteMedia({ ...empty, availableScreens: ['ana'] })
      chat.sendEvent.mockClear()

      useCallStore.getState().watchScreen('ana')

      expect(chat.sendEvent).toHaveBeenCalledWith('call:screen_watch', {
        call_id: 'call-1',
        sharer_id: 'ana',
        watching: true
      })

      chat.sendEvent.mockClear()
      useCallStore.getState().stopWatchingScreen('ana')

      expect(chat.sendEvent).toHaveBeenCalledWith('call:screen_watch', {
        call_id: 'call-1',
        sharer_id: 'ana',
        watching: false
      })
    })

    it('recebe call:screen_watchers e atualiza os espectadores', async () => {
      await joinChannel()

      useCallStore.getState().handleWsEvent({
        type: 'call:screen_watchers',
        payload: {
          call_id: 'call-1',
          sharer_id: 'ana',
          watchers: [
            { id: 'bia', username: 'bia', display_name: 'Bia' },
            { id: 'carlos', username: 'carlos', display_name: 'Carlos' }
          ]
        }
      })

      expect(useCallStore.getState().screenWatchers['ana']).toEqual([
        { id: 'bia', username: 'bia', display_name: 'Bia' },
        { id: 'carlos', username: 'carlos', display_name: 'Carlos' }
      ])
    })

    it('quando sharer encerra tela (call:screen active:false), limpa seus espectadores', async () => {
      await joinChannel()
      useCallStore.setState({
        screenWatchers: {
          ana: [{ id: 'bia', username: 'bia', display_name: 'Bia' }]
        }
      })

      useCallStore.getState().handleWsEvent({
        type: 'call:screen',
        payload: {
          call_id: 'call-1',
          active: false,
          user: { id: 'ana', username: 'ana', display_name: 'Ana' }
        }
      })

      expect(useCallStore.getState().screenWatchers['ana']).toBeUndefined()
    })
  })
})
