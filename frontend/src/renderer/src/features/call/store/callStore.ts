import { create } from 'zustand'
import type { WsEvent } from '../../../shared/api/ws'
import {
  startCall as startCallApi,
  endCall as endCallApi,
  getCallState,
  getCallToken,
  putScreenPreview,
  type CallStateResponse
} from '../api/calls'
import { ApiError } from '../../../shared/api/client'
import { askScreenQuality, getAudioStream, getCameraStream, getDisplayStream } from '../lib/rtc'
import {
  createBackgroundPipeline,
  type BackgroundEffect,
  type BackgroundPipeline
} from '../lib/backgroundPipeline'
import { needsPipeline, resolveBackgroundEffect, sameBackground } from '../lib/videoBackground'
import { useVideoSettingsStore } from './videoSettingsStore'
import { useVideoModalStore } from './videoModalStore'
import { ScreenShareSetupError } from '../lib/displayMedia'
import {
  rememberStreamQuality,
  saveScreenQuality,
  streamQuality,
  type ScreenShareQuality
} from '../lib/screenShareQuality'
import type { MicHandle } from '../lib/noiseSuppression'
import { CallMedia, type CallMediaHandlers, type RemoteMedia } from '../lib/livekit'
import type {
  EndedPayload,
  InvitePayload,
  ResponsePayload,
  RingPayload,
  ScreenSharePayload,
  StatePayload,
  VoicePayload
} from '../lib/callWsPayloads'
import { sameScreenQuality, ScreenQualityQueue } from '../lib/screenQualityQueue'
import {
  nativeLiveActive,
  nativeLivePreview,
  setNativeLiveQuality,
  stopNativeLive,
  tryNativeLive
} from '../lib/nativeLiveShare'
import { watchLocalSpeaking } from '../lib/localSpeaking'
import { mergeLocalSpeaking, sameIds } from '../lib/voiceActivity'
import { voiceServerId } from '../lib/voiceServer'
import { LIVEKIT_URL } from '../../../shared/lib/config'
import { retry } from '../../../shared/lib/retry'
import { micBlockReason, streamBlockReason } from '../lib/voicePermissions'
import { addWatched, miniPlayerOnly, pruneWatched, resolveFocus } from '../lib/screenWatch'
import { createPreviewSender } from '../lib/screenPreviewFlow'
import { captureScreenPreview } from '../lib/screenSnapshot'
import {
  applyLiveEvent,
  LIVE_GRACE_MS,
  reapplyRecentLive,
  type LivePayload,
  type LiveRecord
} from '../lib/liveBadge'
import { callNotification, notifyDesktop } from '../../notifications/lib/notifications'
import { playSound, setSoundOutput } from '../lib/sounds'
import { createKnockEventHandlers } from './knockWsEvents'
import { playOwnJoinSound } from '../lib/entranceSoundOwn'
import { channelJoinState } from '../lib/channelJoinState'
import { staleOwnLive, syncCallState } from '../lib/callStateSync'
import {
  abortWindowAudio,
  resetWindowAudio,
  takeWindowAudio,
  type WindowAudio
} from '../lib/windowAudio'
import { loadAudioPrefs, resolveDeviceId, saveAudioPrefs } from '../lib/audioDevices'
import { useChatStore } from '../../chat/store/chatStore'
import { useAuthStore } from '../../auth/store/authStore'
import { callName, upsertParticipant } from './callPeople'
import { showToast } from '../../../shared/store/toastStore'
import { useConnectionStore } from '../../../shared/store/connectionStore'
import {
  CALL_FAILED_AUTO_LEAVE_MS,
  callConnectionReducer,
  describeDisconnect,
  describeJoinError,
  LK_DISCONNECT,
  describeTokenError,
  IDLE_CALL_CONNECTION,
  type CallConnection,
  type CallConnectionEvent
} from '../lib/callConnection'
import { type CallQuality, type QualityDetails } from '../lib/connectionQuality'
import { createMicPermission } from '../lib/micPermission'
import { createQualityPoller } from '../lib/qualityPoller'

import type { CallResume } from '../../../../../shared/callResume'

import { useSoundboardStore } from './soundboardStore'
import { useBoostStore } from '../../levels/store/boostStore'
import { useActivityStore } from '../../activity/store/activityStore'
import { useAnnotationStore } from './annotationStore'
import { stopAllSoundboardAudio } from '../lib/soundboardPlayer'
import { setVoiceOutputDevice } from '../lib/voiceOutput'

import {
  type CallStatus,
  type CallKind,
  type CallUserInfo,
  type VoiceState,
  type KnockState,
  CallLockedError
} from '../lib/callTypes'

export type {
  CallStatus,
  CallKind,
  CallUserInfo,
  VoiceState,
  KnockState
}
export { CallLockedError }

// Aviso com instruções de instalação (portal de tela no Linux): dá tempo de ler.
const SETUP_TOAST_MS = 20000

/** Contexto que o handleWsEvent entrega ao handler do tipo do evento. */
interface WsContext {
  payload: Record<string, unknown>
  event: WsEvent
  meId: string | undefined
}
type WsHandler = (ctx: WsContext) => void

export interface CallState {
  status: CallStatus
  callId: string | null
  type: CallKind | null
  conversationId: string | null
  channelId: string | null
  /** servidor do canal de voz da chamada (rota de volta da miniatura) */
  serverId: string | null
  participants: CallUserInfo[]
  isInitiator: boolean
  /** userId -> microfone remoto */
  streams: Record<string, MediaStream>
  /** userId -> stream de tela remota (Fase 3) */
  screenStreams: Record<string, MediaStream>
  /** userId -> som da tela remota (jogo, vídeo…) */
  screenAudioStreams: Record<string, MediaStream>
  /** stream de tela local enquanto isScreenSharing (reativo p/ preview) */
  localScreenStream: MediaStream | null
  isScreenSharing: boolean
  screenShareQuality: ScreenShareQuality | null
  /** Última troca pedida e ainda não concluída (null = nada pendente). */
  pendingScreenQuality: ScreenShareQuality | null
  /** userId -> stream de câmera remota (Fase 4, DM) */
  videoStreams: Record<string, MediaStream>
  /** userId -> nome de quem está na sala de mídia (LiveKit), mesmo fora da lista do backend */
  mediaPeers: Record<string, string>
  /** userIds remotos com tela publicada na sala de mídia (assistida ou não) */
  availableScreens: string[]
  /** telas remotas que estou assistindo (só essas são baixadas); zera ao sair da call */
  watchedScreenIds: string[]
  /** palco da call (CallStage) montado = tela da call visível; senão a miniatura aparece */
  stageVisible: boolean
  /** chamada de DM minimizada (barrinha sobre o chat) */
  dmMinimized: boolean
  /** stream da câmera local enquanto ligada (reativo p/ preview espelhado) */
  localCameraStream: MediaStream | null
  /** quem está compartilhando tela segundo o backend (registry) */
  screenSharers: string[]
  /** sharerId -> lista de espectadores assistindo aquela tela */
  screenWatchers: Record<string, CallUserInfo[]>
  /** microfone e saída escolhidos ('' = padrão do sistema) */
  inputDeviceId: string
  outputDeviceId: string
  /** userId -> mudo/ensurdecido dos outros participantes (evento call:voice) */
  voiceStates: Record<string, VoiceState>
  /**
   * userIds falando agora: os outros pela detecção do LiveKit (servidor); o
   * próprio usuário pela detecção local do microfone publicado (sem o atraso
   * da ida e volta ao servidor), ou pelo servidor se a local não carregar.
   */
  speakingIds: string[]
  /** tela em foco no layout expandido (estilo Go Live) */
  focusedScreenUserId: string | null
  muted: boolean
  deafened: boolean
  /** Pode falar neste canal (SPEAK e não silenciado no servidor). */
  canSpeak: boolean
  /** Pode transmitir tela e câmera neste canal (STREAM). */
  canStream: boolean
  startedAt: number | null
  /** Mute de antes de ensurdecer — volta a ele ao desensurdecer. */
  mutedBeforeDeafen: boolean
  /** incrementa a cada evento call:* relevante — usado pela UI p/ revalidar listas */
  listVersion: number
  /** chamadas ativas por canal do servidor aberto (polling da sidebar) */
  serverCalls: Record<string, CallStateResponse>
  /** a sala de voz em que estou está trancada */
  locked: boolean
  /** pedidos para entrar na minha sala trancada (aceitar/recusar) */
  joinRequests: CallUserInfo[]
  /** meu pedido para entrar numa sala trancada, se houver */
  knock: KnockState | null
  /** canal em que acabei de entrar por pedido aceito (a sidebar navega e limpa) */
  admittedChannelId: string | null
  /** Conexão com o servidor de voz: conectando (e em que etapa), reconectando, falhou. */
  connection: CallConnection
  /** userId -> qualidade da conexão (sinal do LiveKit), inclusive a minha. */
  connectionQuality: Record<string, CallQuality>
  /** userId -> perda/latência medidas de quem está com conexão ruim (tooltip). */
  qualityDetails: Record<string, QualityDetails>

  /** "Tentar de novo": refaz a conexão de voz sem sair da chamada. */
  retryConnection: () => void

  toggleLock: () => void
  /** Bate na porta da sala trancada do canal. */
  requestJoin: (channelId: string) => void
  cancelJoinRequest: () => void
  respondJoinRequest: (userId: string, accept: boolean) => void
  clearAdmittedChannel: () => void

  startDMCall: (conversationId: string, peer: CallUserInfo) => Promise<void>
  startChannelCall: (channelId: string, resume?: CallResume, signal?: AbortSignal) => Promise<void>
  acceptCall: () => Promise<void>
  declineCall: () => void
  endCall: () => void
  toggleMute: () => void
  toggleDeafen: () => void
  setInputDevice: (deviceId: string) => Promise<void>
  setOutputDevice: (deviceId: string) => void
  startScreenShare: () => Promise<void>
  stopScreenShare: () => void
  updateScreenQuality: (quality: ScreenShareQuality) => void
  /** `skipPreview`: já passou pela prévia (o botão "Ligar câmera" dela). */
  toggleCamera: (opts?: { skipPreview?: boolean }) => Promise<void>
  /** Troca a câmera ('' = padrão); com a câmera ligada, troca ao vivo. */
  setCameraDevice: (deviceId: string) => Promise<void>
  setFocusedScreenUser: (userId: string | null) => void
  /** Começa a baixar e assistir a transmissão de alguém (e foca nela). */
  watchScreen: (userId: string) => void
  /** Fecha a transmissão: para de baixar e volta ao card "Assistir transmissão". */
  stopWatchingScreen: (userId: string) => void
  setStageVisible: (visible: boolean) => void
  setDmMinimized: (minimized: boolean) => void
  /** Clique na miniatura: põe em destaque uma transmissão que estou assistindo. */
  focusWatchedScreen: (userId: string) => void
  setServerCalls: (map: Record<string, CallStateResponse>) => void
  joinVoiceChannel: (channelId: string) => Promise<void>
  /** WS de chat (re)conectou: ressincroniza a chamada (canal ou DM) e as listas de voz. */
  handleWsReconnect: () => void
  handleWsEvent: (event: WsEvent) => void
}

/** Microfone da chamada (o stream processado + o que precisa ser fechado). */
let localMic: MicHandle | null = null
let transitioning = false
let screenSharePending = false
let callGeneration = 0
/** Reentrada na chamada de canal em andamento (ver resyncChannelCall). */
let resyncing = false
/** Conexão com o servidor de mídia (LiveKit) da chamada atual. */
let media: CallMedia | null = null
/** Falhou e ninguém decidiu: sai sozinho depois de um tempo (ver CALL_FAILED_AUTO_LEAVE_MS). */
let failedLeaveTimer: ReturnType<typeof setTimeout> | null = null
/** Medição de perda/latência enquanto alguém está com conexão ruim. */

const browserOnline = (): boolean => useConnectionStore.getState().online

/** Leitura sob demanda; o histórico pertence somente ao popover. */
export async function readCallLatency(): Promise<number | null> {
  const connection = media
  const ms = await connection?.getLatency()
  return connection === media ? (ms ?? null) : null
}

/** Quem está falando segundo o servidor (ActiveSpeakersChanged). */
let serverSpeakers: string[] = []
/** Fala do próprio usuário detectada aqui; null = sem detecção local. */
let localSpeaking: boolean | null = null
/** Detecção local em andamento (identifica callbacks de uma já parada). */
let speakingWatch: { track: MediaStreamTrack; stop: () => void } | null = null

// Compartilhamento de tela (não-reativo; o estado reativo é localScreenStream)
let localScreenStream: MediaStream | null = null
/** Trocas de qualidade da minha live (Chromium), uma de cada vez. */
const screenQualities = new ScreenQualityQueue<CallMedia>({
  isCurrent: (request) =>
    localScreenStream === request.stream &&
    media === request.connection &&
    useCallStore.getState().callId === request.callId,
  applied: (request) => {
    rememberStreamQuality(request.stream, request.quality)
    saveScreenQuality(request.quality)
    useCallStore.setState({ screenShareQuality: { ...request.quality } })
  },
  failed: () => showToast.error('Não foi possível alterar a qualidade da transmissão.'),
  idle: () => useCallStore.setState({ pendingScreenQuality: null })
})

/** Foto da própria tela para a prévia no cartão de perfil, só quando o servidor pede. */
const sendScreenPreview = createPreviewSender({
  capture: captureScreenPreview,
  upload: putScreenPreview
})

// Som só da janela compartilhada (Windows), quando o helper nativo captura
let windowAudio: WindowAudio | null = null
// Câmera local (não-reativa; o estado reativo é localCameraStream): o que é
// publicado e aparece no tile. Com efeito de fundo é o stream do pipeline.
let localCameraStream: MediaStream | null = null
// A câmera de verdade (igual a localCameraStream quando não há efeito)
let cameraRaw: MediaStream | null = null
// Pipeline do efeito de fundo (null = câmera crua)
let cameraPipeline: BackgroundPipeline | null = null
// O modelo do efeito falhou: não tenta de novo até o usuário escolher outro fundo
let effectUnavailable = false
// Trocas da câmera (dispositivo, efeito) uma por vez
let cameraQueue: Promise<void> = Promise.resolve()
// Publicação da câmera em andamento: trocar o stream antes dela terminar não acharia a track
let cameraPublish: Promise<void> = Promise.resolve()

/** call:live recentes, reaplicados sobre o polling da lista do servidor. */
let recentLive: LiveRecord[] = []

/** Ao reconectar, um 404 só fecha/troca a chamada se repetir (ver confirmGone). */
const GONE_CHECKS = 3
const GONE_CHECK_INTERVAL_MS = 2000

const TOKEN_ATTEMPTS = 10
const TOKEN_RETRY_DELAY_MS = 400

/** Tira o stream da sala (se houver) e só então para as tracks. */
function releaseStream(stream: MediaStream): void {
  const stop = (): void => stream.getTracks().forEach((t) => t.stop())
  if (!media) {
    stop()
    return
  }
  void media
    .unpublish(stream)
    .catch(() => {})
    .finally(stop)
}

/** Como releaseStream, mas também encerra o efeito de fundo (e a câmera por trás dele). */
function releaseCamera(stream: MediaStream): void {
  const pipeline = cameraPipeline
  cameraPipeline = null
  if (!pipeline) {
    releaseStream(stream)
    return
  }
  if (!media) {
    pipeline.destroy()
    return
  }
  void media
    .unpublish(stream)
    .catch(() => {})
    .finally(() => pipeline.destroy())
}

/** O fundo escolhido, já com a imagem resolvida (lido a cada quadro pelo pipeline). */
function currentEffect(): BackgroundEffect {
  const { background, customs } = useVideoSettingsStore.getState()
  return resolveBackgroundEffect(background, customs)
}

function wantsEffect(): boolean {
  const { background, customs } = useVideoSettingsStore.getState()
  return !effectUnavailable && needsPipeline(background, customs)
}

/** Cria o pipeline do efeito sobre a câmera; null (e aviso) se não der. */
function makePipeline(raw: MediaStream): BackgroundPipeline | null {
  try {
    return createBackgroundPipeline(raw, currentEffect, undefined, () => void effectFailed())
  } catch {
    effectUnavailable = true
    showToast.error('Não foi possível aplicar o fundo — usando a câmera normal.')
    return null
  }
}

/** Uma troca da câmera por vez; um erro numa não trava as próximas. */
function enqueueCamera(task: () => Promise<void>): Promise<void> {
  const run = cameraQueue.then(task, task)
  cameraQueue = run.catch(() => {})
  return run
}

function stopStream(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((t) => t.stop())
}

/** Câmera desligada pelo SO/app (ex.: desplugou) desliga a transmissão dela. */
function watchCameraEnded(raw: MediaStream): void {
  raw.getVideoTracks().forEach((track) => {
    track.addEventListener('ended', () => {
      const { status, toggleCamera } = useCallStore.getState()
      if (status === 'active' && cameraRaw === raw) void toggleCamera()
    })
  })
}

/** O pipeline não conseguiu o modelo: volta para a câmera crua, com aviso. */
async function effectFailed(): Promise<void> {
  effectUnavailable = true
  showToast.error('Não foi possível aplicar o fundo — usando a câmera normal.')
  await enqueueCamera(dropEffect)
}

/** Troca o stream publicado do pipeline pela câmera crua, sem desligar a câmera. */
async function dropEffect(): Promise<void> {
  await cameraPublish
  const pipeline = cameraPipeline
  if (!pipeline || !cameraRaw) return
  const raw = pipeline.detach()
  cameraPipeline = null
  try {
    await media?.replaceCamera(raw)
  } catch {
    showToast.error('Não foi possível trocar o vídeo da câmera.')
  }
  if (cameraRaw !== raw) return
  localCameraStream = raw
  useCallStore.setState({ localCameraStream: raw })
}

/** Liga o efeito sobre a câmera que já está publicada. */
async function addEffect(): Promise<void> {
  await cameraPublish
  const raw = cameraRaw
  if (!raw || cameraPipeline || !localCameraStream) return
  const pipeline = makePipeline(raw)
  if (!pipeline) return
  try {
    await media?.replaceCamera(pipeline.stream)
  } catch {
    pipeline.detach()
    showToast.error('Não foi possível aplicar o fundo.')
    return
  }
  if (cameraRaw !== raw) {
    pipeline.detach()
    return
  }
  cameraPipeline = pipeline
  localCameraStream = pipeline.stream
  useCallStore.setState({ localCameraStream: pipeline.stream })
}

function stopLocalStream(): void {
  localMic?.stop()
  localMic = null
}

const EMPTY_MEDIA: RemoteMedia = {
  streams: {},
  screenStreams: {},
  screenAudioStreams: {},
  videoStreams: {},
  mediaPeers: {},
  availableScreens: []
}

/** Microfone da chamada em andamento (null fora dela), para o medidor de sensibilidade. */
export function getCallMicrophone(): MicHandle | null {
  return localMic
}

export const useCallStore = create<CallState>()((set, get) => {
  const bumpList = (): void => {
    set((s) => ({ listVersion: s.listVersion + 1 }))
  }

  /**
   * Junta servidor (os outros) e detecção local (eu). Mudo nunca está
   * falando — nem quando a detecção local caiu e o servidor ainda me lista
   * (ele demora a perceber o mute).
   */
  const publishSpeaking = (): void => {
    const meId = useAuthStore.getState().user?.id ?? null
    const local = get().muted ? false : localSpeaking
    const next = mergeLocalSpeaking(serverSpeakers, meId, local)
    if (!sameIds(get().speakingIds, next)) set({ speakingIds: next })
  }

  const stopLocalSpeaking = (): void => {
    speakingWatch?.stop()
    speakingWatch = null
    localSpeaking = null
  }

  /** (Re)inicia a detecção local na track do microfone da chamada. */
  const startLocalSpeaking = (): void => {
    stopLocalSpeaking()
    const mic = localMic
    const track = mic?.stream.getAudioTracks()[0]
    if (!mic || !track) return
    const watch = { track, stop: () => {} }
    speakingWatch = watch
    localSpeaking = false
    watch.stop = watchLocalSpeaking(mic, {
      onChange: (speaking) => {
        if (speakingWatch !== watch) return
        localSpeaking = speaking
        publishSpeaking()
      },
      onUnavailable: () => {
        if (speakingWatch !== watch) return
        localSpeaking = null
        publishSpeaking()
      }
    })
    publishSpeaking()
  }

  const applyRemoteMedia = ({ reconnecting, ...remote }: RemoteMedia): void => {
    set((s) => {
      const meId = useAuthStore.getState().user?.id ?? null
      const availableScreens = remote.availableScreens ?? []
      // Parou de transmitir: deixa de ser assistida (se voltar, começa pausada).
      // Reconectando, as telas somem só por um instante: mantém o que assisto.
      const watchedScreenIds = reconnecting
        ? s.watchedScreenIds
        : pruneWatched(s.watchedScreenIds, availableScreens)
      // Nada ganha foco sozinho; o foco só muda se a tela em foco acabou. Uma
      // assistida cujo vídeo ainda não chegou continua em foco.
      const focusedScreenUserId = resolveFocus(
        s.focusedScreenUserId,
        watchedScreenIds,
        s.isScreenSharing ? meId : null
      )
      return {
        ...remote,
        mediaPeers: remote.mediaPeers ?? {},
        availableScreens,
        watchedScreenIds,
        focusedScreenUserId,
        ...nativeLivePreview(remote.screenStreams, meId)
      }
    })
  }

  const setConnection = (event: CallConnectionEvent): void => {
    const next = callConnectionReducer(get().connection, event, Date.now())
    if (next !== get().connection) set({ connection: next })
  }

  const clearFailedLeave = (): void => {
    if (failedLeaveTimer) clearTimeout(failedLeaveTimer)
    failedLeaveTimer = null
  }

  const qualityPoller = createQualityPoller<CallMedia>({
    isCurrent: (connection) => media === connection,
    quality: () => get().connectionQuality,
    details: () => get().qualityDetails,
    selfId: () => useAuthStore.getState().user?.id ?? null,
    setDetails: (qualityDetails) => set({ qualityDetails })
  })
  const stopQualityStats = qualityPoller.stop
  const startQualityStats = qualityPoller.start

  /**
   * A conexão de voz falhou (ao entrar ou numa queda sem volta): em vez de
   * sumir com a chamada, o painel mostra o motivo com "Tentar de novo" e
   * "Sair". Ninguém respondeu: sai sozinho depois de um tempo.
   */
  const failMedia = (connection: CallMedia, message: string): void => {
    if (media !== connection) return
    connection.disconnect()
    media = null
    stopQualityStats()
    serverSpeakers = []
    publishSpeaking()
    applyRemoteMedia({ ...EMPTY_MEDIA, reconnecting: true })
    set({ connectionQuality: {}, qualityDetails: {} })
    setConnection({ type: 'failed', error: message })
    showToast.error(message)
    clearFailedLeave()
    const generation = callGeneration
    failedLeaveTimer = setTimeout(() => {
      failedLeaveTimer = null
      if (callGeneration !== generation || get().connection.phase !== 'failed') return
      showToast.info('Você saiu da chamada: não deu para conectar ao servidor de voz.')
      get().endCall()
    }, CALL_FAILED_AUTO_LEAVE_MS)
  }

  /** A mesma conta entrou na chamada em outro aparelho: sai só daqui, sem call:leave (senão o servidor tira os dois). */
  const replacedByOtherDevice = (): void => {
    showToast.info(describeDisconnect(LK_DISCONNECT.DUPLICATE_IDENTITY, true))
    cleanup()
    bumpList()
  }

  /** Reações da sala de mídia; só valem enquanto `self` ainda é a conexão da chamada. */
  const mediaHandlers = (self: () => CallMedia): CallMediaHandlers => {
    const live = (): boolean => media === self()
    return {
      onRemoteMedia: (remote) => {
        if (live()) applyRemoteMedia(remote)
      },
      onConnectionLost: (reason) => {
        if (!live()) return
        if (reason === LK_DISCONNECT.DUPLICATE_IDENTITY) return replacedByOtherDevice()
        failMedia(self(), describeDisconnect(reason, browserOnline()))
      },
      onReconnecting: () => {
        if (live()) setConnection({ type: 'reconnecting' })
      },
      onReconnected: () => {
        if (live()) setConnection({ type: 'reconnected' })
      },
      onSignalConnected: () => {
        if (live()) setConnection({ type: 'step', step: 'media' })
      },
      onConnectionQuality: (userId, quality) => {
        if (!live() || get().connectionQuality[userId] === quality) return
        set((s) => ({ connectionQuality: { ...s.connectionQuality, [userId]: quality } }))
      },
      onActiveSpeakers: (userIds) => {
        if (!live()) return
        serverSpeakers = userIds
        publishSpeaking()
      },
      onRemovedByModerator: () => {
        if (!live()) return
        showToast.info('Um moderador desconectou você da chamada.')
        get().endCall()
      },
      onPublishPermissions: (allowed) => {
        if (!live()) return
        micPermission.sync(allowed)
      }
    }
  }

  /** Pede o token da sala; falha a conexão e devolve null se não der. */
  const fetchMediaToken = async (connection: CallMedia, callId: string): Promise<string | null> => {
    try {
      const { token } = await retry(() => getCallToken(callId), {
        attempts: TOKEN_ATTEMPTS,
        delayMs: TOKEN_RETRY_DELAY_MS,
        shouldRetry: (err) => err instanceof ApiError && err.status === 403
      })
      return token
    } catch (err) {
      if (media !== connection) return null
      const status = err instanceof ApiError ? err.status : null
      failMedia(connection, describeTokenError(status, browserOnline()))
      return null
    }
  }

  /**
   * Tela/câmera ligadas antes da sala conectar (ex.: logo após aceitar). Uma
   * falha aqui desliga só aquela mídia, não a chamada.
   */
  const publishPendingMedia = async (connection: CallMedia): Promise<void> => {
    const screen = localScreenStream
    if (screen) {
      try {
        await connection.publishScreen(screen)
      } catch {
        showToast.error('Não foi possível transmitir a tela.')
        if (localScreenStream === screen) get().stopScreenShare()
      }
    }
    const camera = localCameraStream
    if (camera) {
      try {
        await connection.publishCamera(camera)
      } catch {
        showToast.error('Não foi possível transmitir a câmera.')
        if (localCameraStream === camera) void get().toggleCamera()
      }
    }
  }

  /** Conecta à sala; false se falhou (já tratado) ou se a conexão deixou de valer. */
  const joinMediaRoom = async (
    connection: CallMedia,
    token: string,
    mic: MediaStreamTrack
  ): Promise<boolean> => {
    try {
      await connection.connect(LIVEKIT_URL, token, mic, get().muted)
    } catch (err) {
      if (media !== connection) return false
      const message = describeJoinError(err, browserOnline())
      // Cancelado por nós (saiu, tentou de novo): quem cancelou já cuida.
      if (message !== null) failMedia(connection, message)
      return false
    }
    return media === connection
  }

  /**
   * Entra na sala de mídia da chamada. O callee de DM pode pedir o token antes
   * do backend processar o call:accept (403) — por isso o retry curto.
   */
  const connectMedia = async (callId: string): Promise<void> => {
    if (media || !localMic) return
    const mic = localMic.stream.getAudioTracks()[0]
    if (!mic) return

    const connection: CallMedia = new CallMedia(mediaHandlers(() => connection))
    media = connection
    // Mesma track que vai ser publicada; sobrevive à troca de sala (resync).
    // Só reinicia se a detecção ficou presa a uma track antiga.
    if (speakingWatch?.track !== mic) startLocalSpeaking()

    setConnection({ type: 'start' })
    const token = await fetchMediaToken(connection, callId)
    if (token === null) return
    if (media !== connection || get().callId !== callId) return
    setConnection({ type: 'step', step: 'signal' })
    if (!(await joinMediaRoom(connection, token, mic))) return
    setConnection({ type: 'connected' })
    startQualityStats(connection)

    // O microfone pode ter sido trocado enquanto a sala conectava.
    const currentMic = localMic?.stream.getAudioTracks()[0]
    if (currentMic && currentMic !== mic) await connection.replaceMic(currentMic).catch(() => {})

    // O mute pode ter mudado durante a conexão (antes disso não há o que mutar).
    void connection.setMicMuted(get().muted).catch(() => {})
    sendVoiceState()
    await publishPendingMedia(connection)
  }

  /**
   * Lê o estado da chamada no backend (ver syncCallState). `replace` ao
   * reentrar ou reconectar, quando o local pode ter ficado velho; sem ele,
   * eventos call:joined/call:voice podem ter chegado antes e são mantidos.
   * 'gone': a chamada não existe mais no servidor.
   */
  const loadCallState = async (
    callId: string,
    replace: boolean
  ): Promise<'ok' | 'gone' | 'error'> => {
    const meId = useAuthStore.getState().user?.id
    if (!meId) return 'error'
    try {
      const state = await getCallState(callId)
      if (get().callId !== callId) return 'error'
      useActivityStore.getState().hydrate(callId, state.activity ?? null)
      set((s) => syncCallState(state, meId, s, replace))
      // Live que ficou no servidor sem tela local: tira do ar para todos.
      if (staleOwnLive(state, meId, get().isScreenSharing)) sendScreenState(callId)
      return 'ok'
    } catch (err) {
      // estado indisponível: a lista se forma pelos eventos call:joined
      return err instanceof ApiError && err.status === 404 ? 'gone' : 'error'
    }
  }

  /** A minha live está no ar (Chromium com `stream`, ou o motor nativo sem stream local). */
  const markScreenSharing = (quality: ScreenShareQuality, stream: MediaStream | null): void => {
    const meId = useAuthStore.getState().user?.id
    set((prev) => ({
      isScreenSharing: true,
      screenShareQuality: quality,
      localScreenStream: stream,
      screenSharers: meId ? Array.from(new Set([...prev.screenSharers, meId])) : prev.screenSharers,
      focusedScreenUserId: prev.focusedScreenUserId ?? meId ?? null
    }))
    useChatStore.getState().sendEvent('call:screen', { call_id: get().callId, active: true })
  }

  /**
   * Live pelo motor nativo (docs/adr/0031); true = resolvido (no ar ou a
   * pessoa desistiu no seletor), false = seguir pelo Chromium. Se o helper
   * cair no meio, a live volta pelo Chromium (a pessoa escolhe a tela de novo).
   */
  const shareNatively = async (quality: ScreenShareQuality): Promise<boolean> => {
    const callId = get().callId
    if (!media || !callId) return false
    const result = await tryNativeLive({
      callId,
      quality,
      media,
      onEnded: (failed) => {
        if (get().isScreenSharing && !localScreenStream) get().stopScreenShare()
        if (!failed) return
        showToast.error('A transmissão pelo motor nativo caiu. Escolha a tela de novo.')
        void get().startScreenShare()
      }
    })
    if (result === 'started' && get().callId !== callId) stopNativeLive(media)
    else if (result === 'started') markScreenSharing(quality, null)
    return result !== 'fallback'
  }

  /**
   * Qualidade (seletor do sistema), motor nativo ou o stream do Chromium. null =
   * resolvido sem stream (live nativa, desistiu no seletor ou falhou com aviso).
   */
  const pickScreen = async (): Promise<MediaStream | null> => {
    resetWindowAudio()
    try {
      const asked = await askScreenQuality()
      if (asked && (await shareNatively(asked))) return null
      return await getDisplayStream(asked)
    } catch (err) {
      abortWindowAudio()
      // NotAllowedError: usuário cancelou o picker — sem toast.
      if (err instanceof ScreenShareSetupError) {
        // Ex.: Linux sem o xdg-desktop-portal: diz o que instalar.
        showToast.error(err.message, SETUP_TOAST_MS)
      } else if ((err as DOMException)?.name !== 'NotAllowedError') {
        showToast.error('Não foi possível compartilhar a tela.')
      }
      return null
    }
  }

  /** Janela no Windows: o som vem do helper (só o app da janela). false = a chamada mudou. */
  const addWindowAudio = async (stream: MediaStream, callId: string | null): Promise<boolean> => {
    const captured = await takeWindowAudio()
    // A chamada pode ter acabado (ou mudado) com o seletor aberto.
    if (get().callId !== callId || get().status !== 'active') {
      captured?.stop()
      stream.getTracks().forEach((t) => t.stop())
      return false
    }
    if (captured) {
      // O som da janela substitui qualquer som de sistema da captura.
      stream.getAudioTracks().forEach((t) => {
        stream.removeTrack(t)
        t.stop()
      })
      windowAudio = captured
      stream.addTrack(captured.track)
    }
    return true
  }

  /** A live pelo Chromium: no ar e publicada; parar pela barra do sistema encerra. */
  const goLive = async (stream: MediaStream): Promise<void> => {
    localScreenStream = stream
    markScreenSharing(streamQuality(stream), stream)
    stream.getVideoTracks().forEach((track) => {
      track.addEventListener('ended', () => {
        if (get().isScreenSharing) get().stopScreenShare()
      })
    })
    try {
      await media?.publishScreen(stream)
    } catch {
      showToast.error('Não foi possível transmitir a tela.')
      get().stopScreenShare()
    }
  }

  /** Reenvia ao servidor se estou transmitindo (ou não) — corrige o que se perdeu na queda. */
  const sendScreenState = (callId: string): void => {
    useChatStore
      .getState()
      .sendEvent('call:screen', {
        call_id: callId,
        active: localScreenStream !== null || nativeLiveActive()
      })
  }

  /**
   * A chamada ainda existe no servidor? 'gone' só com 404; 403 (não sou mais
   * participante) quer dizer que ela existe. Erro de rede: 'unknown'.
   */
  const probeCall = async (callId: string): Promise<'exists' | 'gone' | 'unknown'> => {
    try {
      await getCallState(callId)
      return 'exists'
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return 'gone'
      if (err instanceof ApiError && err.status === 403) return 'exists'
      return 'unknown'
    }
  }

  /**
   * 404 ao reconectar só vale como "a chamada acabou" se repetir: um servidor
   * que acabou de subir não pode derrubar a mídia de ninguém por engano.
   */
  const confirmGone = async (callId: string): Promise<boolean> => {
    for (let i = 1; i < GONE_CHECKS; i++) {
      await new Promise((r) => setTimeout(r, GONE_CHECK_INTERVAL_MS))
      if (get().callId !== callId) return false
      if ((await probeCall(callId)) !== 'gone') return false
    }
    return get().callId === callId
  }

  /**
   * O backend tira da chamada quem fica com o WS de chat caído além da
   * tolerância, mas a mídia (LiveKit) segue conectada — a pessoa continua
   * falando/transmitindo e some da lista de todo mundo. Ao reconectar (ou ao
   * saber que foi tirado), volta a se registrar na chamada do canal.
   *
   * Nunca troca de sala por engano: se o servidor diz que a chamada não existe,
   * só entra numa nova (desconectando a mídia) depois de confirmar o 404 e se
   * ninguém mais estiver na sala de mídia — senão separaria quem ainda conversa.
   */
  const resyncChannelCall = async (): Promise<void> => {
    const { status, type, channelId, callId } = get()
    if (status !== 'active' || type !== 'channel' || !channelId || !callId || resyncing) return
    resyncing = true
    try {
      const probe = await probeCall(callId)
      if (probe === 'unknown') return // servidor indisponível: a próxima reconexão tenta
      if (probe === 'gone') {
        const gone = await confirmGone(callId)
        if (get().callId !== callId) return
        // Confirmado, mas ainda há gente na sala de mídia: não separa ninguém.
        if (gone && Object.keys(get().mediaPeers).length > 0) return
        // Não confirmado: a chamada existe de novo, segue o caminho normal.
      }
      // Idempotente: se ainda estou na chamada, nada muda no backend.
      const call = await startCallApi({ type: 'channel', channel_id: channelId })
      if (get().callId !== callId) return
      if (call.id !== callId) {
        // A chamada antiga acabou enquanto eu estava fora: segue na nova.
        useChatStore.getState().unsubscribeRoom(`call:${callId}`)
        useBoostStore.getState().clearCall(callId)
        useChatStore.getState().subscribeRoom(`call:${call.id}`)
        media?.disconnect()
        media = null
        serverSpeakers = []
        set({ callId: call.id, participants: [], ...EMPTY_MEDIA, watchedScreenIds: [] })
        publishSpeaking()
        void connectMedia(call.id)
      }
      await loadCallState(call.id, true)
      if (get().callId !== call.id) return
      sendVoiceState()
      sendScreenState(call.id)
      bumpList()
    } catch {
      // segue com a mídia; a próxima reconexão tenta de novo
    } finally {
      resyncing = false
    }
  }

  /**
   * DM depois de o WS de chat reconectar (ex.: deploy do servidor): eventos da
   * queda se perderam. Atualiza o estado (mudo, tela) sem mexer na mídia e
   * reenvia o meu. Só fecha a chamada se o servidor confirmar que ela acabou
   * (404 repetido) e a outra pessoa já tiver saído da sala de mídia; o sinal
   * normal de fim continua sendo o call:ended.
   */
  const resyncDmCall = async (): Promise<void> => {
    const { status, type, callId } = get()
    if (type !== 'dm' || !callId || status === 'idle') return
    // Tocando, ainda não sou participante: o servidor responde 403 (nada muda)
    // ou 404 se a chamada acabou (o reinício encerra as que só tocavam).
    let result = await loadCallState(callId, true)
    if (get().callId !== callId) return
    if (result === 'gone') {
      if (await confirmGone(callId)) {
        const peerInMedia = get().participants.some((p) => p.id in get().mediaPeers)
        if (get().status === 'active' && peerInMedia) return
        cleanup()
        bumpList()
        return
      }
      if (get().callId !== callId) return
      // O 404 passou (servidor acabando de subir): lê o estado de novo.
      result = await loadCallState(callId, true)
      if (get().callId !== callId) return
    }
    if (result !== 'ok' || get().status !== 'active') return
    sendVoiceState()
    sendScreenState(callId)
  }

  const cleanup = (): void => {
    callGeneration++
    const callId = get().callId
    if (callId) {
      useChatStore.getState().unsubscribeRoom(`call:${callId}`)
      useBoostStore.getState().clearCall(callId)
    }
    media?.disconnect()
    media = null
    clearFailedLeave()
    stopQualityStats()
    stopLocalSpeaking()
    serverSpeakers = []
    micPermission.reset()
    stopLocalStream()
    localScreenStream?.getTracks().forEach((t) => t.stop())
    localScreenStream = null
    stopNativeLive(null)
    screenQualities.clear()
    windowAudio?.stop()
    windowAudio = null
    localCameraStream?.getTracks().forEach((t) => t.stop())
    localCameraStream = null
    cameraRaw?.getTracks().forEach((t) => t.stop())
    cameraRaw = null
    cameraPipeline?.destroy()
    cameraPipeline = null
    useSoundboardStore.getState().clearActivePlays()
    useAnnotationStore.getState().cleanup()
    set({
      status: 'idle',
      callId: null,
      type: null,
      conversationId: null,
      channelId: null,
      serverId: null,
      participants: [],
      isInitiator: false,
      ...EMPTY_MEDIA,
      localScreenStream: null,
      isScreenSharing: false,
      screenShareQuality: null,
      pendingScreenQuality: null,
      localCameraStream: null,
      screenSharers: [],
      screenWatchers: {},
      speakingIds: [],
      voiceStates: {},
      watchedScreenIds: [],
      dmMinimized: false,
      focusedScreenUserId: null,
      muted: false,
      deafened: false,
      canSpeak: true,
      canStream: true,
      mutedBeforeDeafen: false,
      startedAt: null,
      locked: false,
      joinRequests: [],
      connection: IDLE_CALL_CONNECTION,
      connectionQuality: {},
      qualityDetails: {}
    })
  }

  /**
   * Abre o microfone escolhido; se ele sumiu desde a última vez (headset
   * desconectado), usa o padrão do sistema em vez de impedir a chamada.
   */
  const openMic = async (): Promise<MicHandle> => {
    const id = get().inputDeviceId
    try {
      return await getAudioStream(id)
    } catch (err) {
      const name = (err as DOMException)?.name
      if (!id || (name !== 'OverconstrainedError' && name !== 'NotFoundError')) throw err
      showToast.info('Microfone escolhido não encontrado — usando o padrão do sistema.')
      set({ inputDeviceId: '' })
      saveAudioPrefs({ inputId: '', outputId: get().outputDeviceId })
      return getAudioStream('')
    }
  }

  /** Aplica o mute no microfone local e na sala. */
  const applyMute = (muted: boolean): void => {
    localMic?.stream.getAudioTracks().forEach((track) => {
      track.enabled = !muted
    })
    void media?.setMicMuted(muted).catch(() => {})
  }

  /**
   * Avisa o servidor (e por ele os demais) do mute/ensurdecer atual. Só com a
   * chamada ativa: tocando, ainda não sou participante (o servidor recusaria).
   * Reenviado ao conectar a mídia, então nada se perde.
   */
  const sendVoiceState = (): void => {
    const { callId, muted, deafened, status } = get()
    if (!callId || status !== 'active') return
    useChatStore.getState().sendEvent('call:voice', { call_id: callId, muted, deafened })
  }

  const micPermission = createMicPermission({
    muted: () => get().muted,
    deafened: () => get().deafened,
    patch: (partial) => set(partial),
    commitMute: (muted) => {
      applyMute(muted)
      publishSpeaking()
      sendVoiceState()
    },
    ensureMic: (muted) => {
      void media?.ensureMic(muted).catch(() => {})
    }
  })

  const onScreenDraw: WsHandler = ({ event }) => {
    useAnnotationStore.getState().handleWsEvent(event)
    return
  }

  const knockHandlers = createKnockEventHandlers({ get, set })

  const wsHandlers: Record<string, WsHandler> = {
    'call:invite': ({ payload }) => {
      const p = payload as unknown as InvitePayload
      if (p.type !== 'dm' || get().status !== 'idle') return
      notifyDesktop(callNotification(p.initiator))
      set({
        status: 'ringing',
        callId: p.call_id,
        type: 'dm',
        conversationId: p.conversation_id ?? null,
        channelId: null,
        participants: [p.initiator],
        isInitiator: false,
        streams: {},
        muted: false,
        deafened: false,
        startedAt: null
      })
      return
    },

    'call:ring': ({ payload }) => {
      const p = payload as unknown as RingPayload
      if (get().callId !== p.call_id) return
      set({ participants: upsertParticipant(get().participants, p.callee) })
      return
    },

    'call:accept': ({ payload }) => {
      const p = payload as unknown as ResponsePayload
      if (get().callId !== p.call_id) return
      const current = get()
      const participants = upsertParticipant(current.participants, p.user)
      if (current.status !== 'active') {
        set({ status: 'active', startedAt: Date.now(), participants })
        playSound('join')
      } else {
        set({ participants })
      }
      if (current.isInitiator && current.type === 'dm' && current.callId) {
        void connectMedia(current.callId)
      }
      return
    },

    'call:decline': ({ payload }) => {
      const p = payload as unknown as ResponsePayload
      if (get().callId !== p.call_id) return
      showToast.info(`${p.user.display_name} recusou a chamada.`)
      cleanup()
      return
    },

    'call:voice': ({ payload }) => {
      const p = payload as unknown as VoicePayload
      const state = {
        muted: p.muted,
        deafened: p.deafened,
        serverMuted: Boolean(p.server_muted),
        serverDeafened: Boolean(p.server_deafened)
      }
      // Mesmo estado no formato da API (lista dos canais de voz do servidor).
      const apiState = {
        muted: p.muted,
        deafened: p.deafened,
        server_muted: Boolean(p.server_muted),
        server_deafened: Boolean(p.server_deafened)
      }
      set((s) => {
        // Lista dos canais de voz do servidor (inclusive de chamadas em que não estou).
        const serverCalls = { ...s.serverCalls }
        for (const [channelId, entry] of Object.entries(serverCalls)) {
          if (entry.call?.id !== p.call_id) continue
          serverCalls[channelId] = {
            ...entry,
            participants: entry.participants.map((q) =>
              q.user_id === p.user_id ? { ...q, ...apiState } : q
            )
          }
        }
        return {
          serverCalls,
          voiceStates:
            s.callId === p.call_id ? { ...s.voiceStates, [p.user_id]: state } : s.voiceStates
        }
      })
      return
    },

    'call:screen': ({ payload, meId }) => {
      const p = payload as unknown as ScreenSharePayload
      if (get().callId !== p.call_id || p.user.id === meId) return
      set((s) => {
        const nextWatchers = { ...s.screenWatchers }
        if (!p.active) {
          delete nextWatchers[p.user.id]
        }
        return {
          screenSharers: p.active
            ? Array.from(new Set([...s.screenSharers, p.user.id]))
            : s.screenSharers.filter((id) => id !== p.user.id),
          screenWatchers: nextWatchers,
          // Transmissão nova começa pausada: só a que acabou perde o foco.
          focusedScreenUserId:
            !p.active && s.focusedScreenUserId === p.user.id ? null : s.focusedScreenUserId,
          participants: upsertParticipant(s.participants, p.user)
        }
      })
      return
    },

    'call:screen_watchers': ({ payload }) => {
      const p = payload as unknown as {
        call_id: string
        sharer_id: string
        watchers: CallUserInfo[]
      }
      if (get().callId !== p.call_id) return
      set((s) => ({
        screenWatchers: {
          ...s.screenWatchers,
          [p.sharer_id]: p.watchers
        }
      }))
      return
    },

    'call:screen_preview_request': ({ payload }) => {
      // Alguém abriu meu cartão de perfil: manda uma foto pequena da tela.
      const p = payload as unknown as { call_id: string }
      // Live nativa: a minha prévia vinda do servidor.
      const stream = localScreenStream ?? get().localScreenStream
      if (!stream || get().callId !== p.call_id || !get().isScreenSharing) return
      void sendScreenPreview(p.call_id, stream)
      return
    },

    'call:screen_draw': onScreenDraw,
    'call:screen_draw_clear': onScreenDraw,
    'call:screen_draw_undo': onScreenDraw,
    'call:live': ({ payload }) => {
      // Selo LIVE na lista do servidor (inclusive de chamadas em que não estou).
      const p = payload as unknown as LivePayload
      const now = Date.now()
      recentLive = [
        ...recentLive.filter((r) => now - r.at < LIVE_GRACE_MS),
        { payload: p, at: now }
      ]
      const known = Object.values(get().serverCalls).some((e) => e.call?.id === p.call_id)
      set((s) => ({ serverCalls: applyLiveEvent(s.serverCalls, p) }))
      // Chamada que começou depois do último polling: busca a lista agora.
      if (!known) bumpList()
      return
    },

    'call:joined': ({ payload, meId }) => {
      const p = payload as unknown as StatePayload
      if (get().callId !== p.call_id) return
      const current = get()
      if (current.type === 'channel') {
        if (current.status !== 'active' || !meId || p.user.id === meId) return
        set({ participants: upsertParticipant(current.participants, p.user) })
        bumpList()
        return
      }
      if (current.status === 'outgoing') {
        set({ status: 'active', startedAt: Date.now() })
        playSound('join')
      }
      return
    },

    'call:left': ({ payload, meId }) => {
      const p = payload as unknown as StatePayload
      if (get().callId !== p.call_id) return
      if (p.user.id === meId) {
        // Ainda estou na chamada (quem sai de propósito já limpou o callId):
        // o backend me tirou por queda do WS — volta a entrar.
        void resyncChannelCall()
        return
      }
      if (get().type === 'channel') {
        // Sem pop-up: o som e a lista de participantes já avisam.
        playSound('userLeave')
        // A mídia do participante some sozinha quando ele sai da sala do LiveKit.
        set((s) => {
          const nextWatchers = { ...s.screenWatchers }
          delete nextWatchers[p.user.id]
          for (const [sid, list] of Object.entries(nextWatchers)) {
            nextWatchers[sid] = list.filter((w) => w.id !== p.user.id)
          }
          return {
            participants: s.participants.filter((q) => q.id !== p.user.id),
            screenSharers: s.screenSharers.filter((id) => id !== p.user.id),
            screenWatchers: nextWatchers
          }
        })
        bumpList()
        return
      }
      // Na DM a saída do outro encerra a chamada: aqui o aviso faz falta.
      showToast.info(`${callName(get(), p.user)} saiu da chamada.`)
      get().endCall()
      return
    },

    'call:ended': ({ payload }) => {
      const p = payload as unknown as EndedPayload
      if (get().callId !== p.call_id) return
      cleanup()
      bumpList()
      return
    },

    'call:busy': () => {
      showToast.error('O usuário está ocupado em outra chamada.')
      cleanup()
      return
    },

    'call:moved': ({ payload, meId }) => {
      // Um moderador moveu alguém de canal de voz: as listas mudam.
      bumpList()
      const p = payload as unknown as {
        from_call_id: string
        channel_id: string
        channel_name: string
        user: CallUserInfo
        moved_by: CallUserInfo
      }
      if (p.user.id !== meId || get().callId !== p.from_call_id) return
      // Fui eu: o servidor já me colocou no canal novo; troca a mídia de
      // sala mantendo o mute/ensurdecer de antes.
      const { muted, deafened } = get()
      cleanup()
      void get()
        .startChannelCall(p.channel_id)
        .then(() => {
          if (get().channelId !== p.channel_id) return
          set({ muted: muted || deafened, deafened })
          applyMute(muted || deafened)
          publishSpeaking()
          sendVoiceState()
          showToast.info(
            `${callName(get(), p.moved_by, 'Um moderador')} moveu você para ${p.channel_name || 'outro canal'}.`
          )
        })
      return
    },

    'call:error': ({ payload }) => {
      const message = (payload.message as string) ?? 'Erro na chamada.'
      showToast.error(message)
      if (get().callId === (payload.call_id as string | undefined) || !payload.call_id) {
        cleanup()
      }
      return
    }
  }

  return {
    status: 'idle',
    callId: null,
    type: null,
    conversationId: null,
    channelId: null,
    serverId: null,
    participants: [],
    isInitiator: false,
    ...EMPTY_MEDIA,
    localScreenStream: null,
    isScreenSharing: false,
    screenShareQuality: null,
    pendingScreenQuality: null,
    localCameraStream: null,
    screenSharers: [],
    screenWatchers: {},
    speakingIds: [],
    voiceStates: {},
    watchedScreenIds: [],
    stageVisible: false,
    dmMinimized: false,
    inputDeviceId: loadAudioPrefs().inputId,
    outputDeviceId: loadAudioPrefs().outputId,
    focusedScreenUserId: null,
    muted: false,
    deafened: false,
    canSpeak: true,
    canStream: true,
    mutedBeforeDeafen: false,
    startedAt: null,
    listVersion: 0,
    serverCalls: {},
    locked: false,
    joinRequests: [],
    knock: null,
    admittedChannelId: null,
    connection: IDLE_CALL_CONNECTION,
    connectionQuality: {},
    qualityDetails: {},

    retryConnection: () => {
      const { status, callId } = get()
      if (status !== 'active' || !callId || !localMic) return
      clearFailedLeave()
      stopQualityStats()
      // Derruba a tentativa atual (se houver) e começa outra na mesma chamada.
      const previous = media
      media = null
      previous?.disconnect()
      serverSpeakers = []
      publishSpeaking()
      applyRemoteMedia({ ...EMPTY_MEDIA, reconnecting: true })
      set({ connectionQuality: {}, qualityDetails: {} })
      void connectMedia(callId)
    },

    toggleLock: () => {
      const { callId, type, locked, status } = get()
      if (!callId || type !== 'channel' || status !== 'active') return
      useChatStore.getState().sendEvent('call:lock', { call_id: callId, locked: !locked })
    },

    requestJoin: (channelId: string) => {
      const serverCalls = get().serverCalls
      const call = serverCalls[channelId]?.call
      if (!call) return
      set({ knock: { channelId, callId: call.id, status: 'pending' } })
      playSound('knock')
      useChatStore.getState().sendEvent('call:knock', { call_id: call.id })
    },

    cancelJoinRequest: () => {
      const { knock } = get()
      if (!knock) return
      useChatStore.getState().sendEvent('call:knock_cancel', { call_id: knock.callId })
      set({ knock: null })
    },

    respondJoinRequest: (userId: string, accept: boolean) => {
      const { callId, status } = get()
      if (!callId || status !== 'active') return
      // Remove otimista da lista de pedidos locais
      set((s) => ({ joinRequests: s.joinRequests.filter((r) => r.id !== userId) }))
      useChatStore.getState().sendEvent('call:knock_respond', {
        call_id: callId,
        user_id: userId,
        accept
      })
    },

    clearAdmittedChannel: () => {
      set({ admittedChannelId: null })
    },

    startDMCall: async (conversationId, peer) => {
      if (get().status !== 'idle' || transitioning) return
      transitioning = true
      try {
        localMic = await openMic()
      } catch {
        showToast.error('Não foi possível acessar o microfone.')
        transitioning = false
        return
      }

      try {
        const call = await startCallApi({ type: 'dm', conversation_id: conversationId })
        set({
          status: 'outgoing',
          callId: call.id,
          type: 'dm',
          conversationId,
          channelId: null,
          participants: [peer],
          isInitiator: true,
          streams: {},
          muted: false,
          deafened: false,
          startedAt: null
        })
        useChatStore.getState().subscribeRoom(`call:${call.id}`)
      } catch (err) {
        stopLocalStream()
        showToast.error(err instanceof Error ? err.message : 'Não foi possível iniciar a chamada.')
      } finally {
        transitioning = false
      }
    },

    startChannelCall: async (channelId, resume, signal) => {
      if (get().status !== 'idle' || transitioning) return
      transitioning = true
      const generation = callGeneration
      const cancelled = (): boolean =>
        !!resume &&
        (signal?.aborted === true ||
          generation !== callGeneration ||
          useAuthStore.getState().user?.id !== resume.userId)
      try {
        localMic = await openMic()
        if (cancelled()) {
          stopLocalStream()
          transitioning = false
          return
        }
      } catch {
        showToast.error('Não foi possível acessar o microfone.')
        transitioning = false
        if (resume) throw new Error('Não foi possível acessar o microfone.')
        return
      }

      try {
        // Idempotente no backend: se já há chamada ativa no canal, entra nela.
        const call = await startCallApi({ type: 'channel', channel_id: channelId })
        if (cancelled()) {
          stopLocalStream()
          useChatStore.getState().sendEvent('call:leave', { call_id: call.id })
          return
        }
        const join = channelJoinState(call, resume)
        localMic.stream.getAudioTracks().forEach((track) => {
          track.enabled = !join.muted
        })
        set({
          ...join,
          status: 'active',
          callId: call.id,
          type: 'channel',
          conversationId: null,
          channelId,
          participants: [],
          isInitiator: false,
          streams: {},
          startedAt: Date.now()
        })
        void playOwnJoinSound(join.deafened)
        useChatStore.getState().subscribeRoom(`call:${call.id}`)
        // O backend já registrou a entrada (startCall é idempotente): a mídia
        // pode conectar em paralelo à leitura do estado da chamada.
        void connectMedia(call.id)

        await loadCallState(call.id, false)
        bumpList()
      } catch (err) {
        stopLocalStream()
        if (err instanceof ApiError && err.status === 423) {
          const callId = (err.body?.call_id as string) ?? null
          throw new CallLockedError(callId)
        }
        if (resume) throw err
        showToast.error(err instanceof Error ? err.message : 'Não foi possível entrar na chamada.')
      } finally {
        transitioning = false
      }
    },

    acceptCall: async () => {
      const { status, callId, participants } = get()
      const peer = participants[0]
      if (status !== 'ringing' || !callId || !peer || transitioning) return
      transitioning = true
      try {
        localMic = await openMic()
      } catch {
        showToast.error('Não foi possível acessar o microfone.')
        transitioning = false
        return
      }

      // Otimista: o broadcast de call:accept pode chegar antes da assinatura da room.
      set({ status: 'active', startedAt: Date.now() })
      playSound('join')
      useChatStore.getState().sendEvent('call:accept', { call_id: callId })
      useChatStore.getState().subscribeRoom(`call:${callId}`)
      transitioning = false
      void connectMedia(callId)
    },

    declineCall: () => {
      const { status, callId } = get()
      if (status !== 'ringing' || !callId) return
      useChatStore.getState().sendEvent('call:decline', { call_id: callId })
      cleanup()
    },

    endCall: () => {
      const { callId, status, type } = get()
      if (!callId) {
        cleanup()
        return
      }
      if (status === 'active') playSound('leave')
      if (status === 'ringing') {
        useChatStore.getState().sendEvent('call:decline', { call_id: callId })
      } else {
        useChatStore.getState().sendEvent('call:leave', { call_id: callId })
        // Em canal, a queda de WS já dispara HandleDisconnect no servidor.
        if (type === 'dm' && !useChatStore.getState().isWsConnected()) {
          void endCallApi(callId).catch(() => {})
        }
      }
      cleanup()
      bumpList()
    },

    toggleMute: () => {
      const next = !get().muted
      // Sem permissão de falar (ou silenciado por um moderador) não dá para desmutar.
      if (!next) {
        const meId = useAuthStore.getState().user?.id
        const blocked = micBlockReason({
          canSpeak: get().canSpeak,
          serverMuted: Boolean(meId && get().voiceStates[meId]?.serverMuted)
        })
        if (blocked) {
          showToast.error(blocked)
          return
        }
      }
      // Desmutar enquanto ensurdecido também tira o ensurdecer.
      set(next ? { muted: true } : { muted: false, deafened: false })
      applyMute(next)
      publishSpeaking()
      sendVoiceState()
      playSound(next ? 'mute' : 'unmute')
    },

    toggleDeafen: () => {
      const next = !get().deafened
      if (next) {
        set({ mutedBeforeDeafen: get().muted, deafened: true, muted: true })
        applyMute(true)
        stopAllSoundboardAudio()
      } else {
        set({ deafened: false, muted: get().mutedBeforeDeafen })
        applyMute(get().mutedBeforeDeafen)
      }
      publishSpeaking()
      sendVoiceState()
      playSound(next ? 'deafen' : 'undeafen')
    },

    setInputDevice: async (deviceId) => {
      set({ inputDeviceId: deviceId })
      saveAudioPrefs({ inputId: deviceId, outputId: get().outputDeviceId })
      if (!localMic) return
      let next: MicHandle
      try {
        next = await getAudioStream(deviceId)
      } catch {
        showToast.error('Não foi possível usar esse microfone.')
        return
      }
      const previous = localMic
      // A chamada pode ter acabado enquanto o dispositivo abria.
      if (!previous) {
        next.stop()
        return
      }
      const track = next.stream.getAudioTracks()[0]
      track.enabled = !get().muted
      localMic = next
      // A detecção segue o microfone publicado.
      if (speakingWatch) startLocalSpeaking()
      try {
        await media?.replaceMic(track)
        // O SDK muta sozinho quando a track antiga morre (ex.: headset tirado).
        await media?.setMicMuted(get().muted)
      } catch {
        showToast.error('Não foi possível trocar o microfone.')
      }
      previous.stop()
    },

    setOutputDevice: (deviceId) => {
      set({ outputDeviceId: deviceId })
      setSoundOutput(deviceId)
      setVoiceOutputDevice(deviceId)
      saveAudioPrefs({ inputId: get().inputDeviceId, outputId: deviceId })
    },

    startScreenShare: async () => {
      const s = get()
      if (s.status !== 'active' || s.isScreenSharing || transitioning || screenSharePending) return
      const blocked = streamBlockReason(s.canStream)
      if (blocked) {
        showToast.error(blocked)
        return
      }
      screenSharePending = true
      try {
        const stream = await pickScreen()
        if (stream && (await addWindowAudio(stream, s.callId))) await goLive(stream)
      } finally {
        screenSharePending = false
      }
    },

    updateScreenQuality: (quality) => {
      if (setNativeLiveQuality(quality)) {
        saveScreenQuality(quality)
        set({ screenShareQuality: { ...quality } })
        return
      }
      const s = get()
      const stream = localScreenStream
      const connection = media
      if (
        s.status !== 'active' ||
        !s.isScreenSharing ||
        !stream ||
        !connection ||
        screenSharePending ||
        transitioning
      )
        return
      if (sameScreenQuality(s.pendingScreenQuality ?? s.screenShareQuality, quality)) return
      set({ pendingScreenQuality: { ...quality } })
      screenQualities.push({ stream, connection, callId: s.callId, quality: { ...quality } })
    },

    stopScreenShare: () => {
      const s = get()
      if (!s.isScreenSharing && !localScreenStream) return
      const meId = useAuthStore.getState().user?.id
      const callId = s.callId
      const stream = localScreenStream
      localScreenStream = null
      screenQualities.clear()
      windowAudio?.stop()
      windowAudio = null
      stopNativeLive(media)

      if (stream) releaseStream(stream)

      set((prev) => ({
        isScreenSharing: false,
        screenShareQuality: null,
        pendingScreenQuality: null,
        localScreenStream: null,
        screenSharers: prev.screenSharers.filter((id) => id !== meId),
        focusedScreenUserId: prev.focusedScreenUserId === meId ? null : prev.focusedScreenUserId
      }))

      if (callId) {
        useChatStore.getState().sendEvent('call:screen', { call_id: callId, active: false })
      }
    },

    setFocusedScreenUser: (userId) => {
      set({ focusedScreenUserId: userId })
    },

    watchScreen: (userId) => {
      const s = get()
      if (s.status !== 'active' || !s.availableScreens.includes(userId)) return
      const next = addWatched(s.watchedScreenIds, userId)
      set({ watchedScreenIds: next, focusedScreenUserId: userId })
      media?.setWatchedScreens(next)
      if (s.callId) {
        useChatStore.getState().sendEvent('call:screen_watch', {
          call_id: s.callId,
          sharer_id: userId,
          watching: true
        })
      }
    },

    stopWatchingScreen: (userId) => {
      const s = get()
      const next = s.watchedScreenIds.filter((id) => id !== userId)
      set({
        watchedScreenIds: next,
        focusedScreenUserId: s.focusedScreenUserId === userId ? null : s.focusedScreenUserId
      })
      media?.setWatchedScreens(next)
      if (s.callId) {
        useChatStore.getState().sendEvent('call:screen_watch', {
          call_id: s.callId,
          sharer_id: userId,
          watching: false
        })
      }
    },

    setStageVisible: (visible) => {
      const s = get()
      // Saiu da tela da call: a miniatura mostra uma transmissão só, e as
      // outras param de baixar (e de tocar som) até a pessoa voltar e assistir.
      const next = visible
        ? s.watchedScreenIds
        : miniPlayerOnly(s.watchedScreenIds, s.focusedScreenUserId, s.screenStreams)
      if (next === s.watchedScreenIds) {
        set({ stageVisible: visible })
        return
      }
      const meId = useAuthStore.getState().user?.id ?? null
      set({
        stageVisible: visible,
        watchedScreenIds: next,
        focusedScreenUserId: resolveFocus(
          s.focusedScreenUserId,
          next,
          s.isScreenSharing ? meId : null
        )
      })
      media?.setWatchedScreens(next)
    },

    setDmMinimized: (minimized) => {
      set({ dmMinimized: minimized })
    },

    focusWatchedScreen: (userId) => {
      if (!get().watchedScreenIds.includes(userId)) return
      // DM minimizada: a rota já é a da call, então só expandir mostra o palco.
      set({ focusedScreenUserId: userId, dmMinimized: false })
    },

    toggleCamera: async (opts) => {
      const s = get()
      if (s.type === null || s.status !== 'active' || transitioning) return

      if (localCameraStream) {
        // Desligar: remove as tracks de cada PC e renegocia (o par detecta
        // o fim pelo evento 'mute' da track remota).
        const stream = localCameraStream
        localCameraStream = null
        cameraRaw = null
        set({ localCameraStream: null })
        releaseCamera(stream)
        return
      }

      const blocked = streamBlockReason(s.canStream)
      if (blocked) {
        showToast.error(blocked)
        return
      }

      // "Sempre ver prévia do vídeo": mostra a prévia antes de abrir a câmera na chamada.
      if (!opts?.skipPreview && useVideoSettingsStore.getState().alwaysPreview) {
        useVideoModalStore.getState().openPreview()
        return
      }

      let stream: MediaStream
      try {
        stream = await getCameraStream(useVideoSettingsStore.getState().cameraId)
      } catch (err) {
        if ((err as DOMException)?.name !== 'NotAllowedError') {
          showToast.error('Não foi possível acessar a câmera.')
        }
        return
      }
      // A chamada pode ter acabado enquanto a câmera abria.
      if (get().callId !== s.callId || get().status !== 'active' || localCameraStream) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }

      const rawCamera = stream
      // Fundo escolhido: o que vai para a prévia e para a sala é o stream
      // processado. Se o pipeline falhar, segue com a câmera crua.
      if (wantsEffect()) {
        const pipeline = makePipeline(rawCamera)
        if (pipeline) {
          cameraPipeline = pipeline
          stream = pipeline.stream
        }
      }

      cameraRaw = rawCamera
      localCameraStream = stream
      set({ localCameraStream: stream })
      watchCameraEnded(rawCamera)

      const publishing = Promise.resolve(media?.publishCamera(stream))
      cameraPublish = publishing.then(
        () => {},
        () => {}
      )
      try {
        await publishing
      } catch {
        showToast.error('Não foi possível transmitir a câmera.')
        if (localCameraStream === stream) void get().toggleCamera()
      }
    },

    setCameraDevice: (deviceId) =>
      enqueueCamera(async () => {
        const settings = useVideoSettingsStore.getState()
        const previous = settings.cameraId
        settings.setCameraId(deviceId)
        const live = localCameraStream
        if (!live || get().status !== 'active') return
        const callId = get().callId
        let next: MediaStream | null = null
        try {
          next = await getCameraStream(deviceId)
          // A chamada ou a câmera podem ter acabado enquanto o dispositivo abria.
          if (get().callId !== callId || get().status !== 'active' || localCameraStream !== live) {
            stopStream(next)
            return
          }
          const old = cameraRaw
          if (cameraPipeline) {
            cameraPipeline.setSource(next) // para a câmera antiga
          } else {
            await media?.replaceCamera(next)
            stopStream(old)
            localCameraStream = next
            set({ localCameraStream: next })
          }
          cameraRaw = next
          watchCameraEnded(next)
        } catch (err) {
          stopStream(next)
          useVideoSettingsStore.getState().setCameraId(previous)
          if ((err as DOMException)?.name !== 'NotAllowedError') {
            showToast.error('Não foi possível usar essa câmera.')
          }
        }
      }),

    setServerCalls: (map) => {
      set({ serverCalls: reapplyRecentLive(map, recentLive, Date.now()) })
    },

    joinVoiceChannel: async (channelId) => {
      const s = get()
      // Se a sala estiver trancada e o usuário não estiver nela, pede para entrar diretamente
      const targetCall = s.serverCalls[channelId]?.call
      if (targetCall?.locked && (s.status === 'idle' || s.channelId !== channelId)) {
        s.requestJoin(channelId)
        return
      }

      if (s.status !== 'idle') {
        if (s.type !== 'channel') {
          throw new Error('Você já está em uma chamada.')
        }
        if (s.channelId === channelId) {
          // Já conectado: não desconecta (estilo Discord) — a UI só exibe a view.
          return
        }
        // Entrar em outro canal de voz desconecta do atual.
        s.endCall()
      }
      try {
        await get().startChannelCall(channelId)
      } catch (err) {
        if (err instanceof CallLockedError) {
          if (err.callId) {
            set({ knock: { channelId, callId: err.callId, status: 'pending' } })
            playSound('knock')
            useChatStore.getState().sendEvent('call:knock', { call_id: err.callId })
          }
          return
        }
        throw err
      }
    },

    handleWsReconnect: () => {
      // A voz falhou (ex.: sem internet) e o chat voltou: a rede voltou, tenta a voz de novo.
      if (get().status === 'active' && get().connection.phase === 'failed') get().retryConnection()
      void resyncChannelCall()
      void resyncDmCall()
      // Listas dos canais de voz (quem está em cada um, LIVE) voltam a valer.
      bumpList()
      const { knock } = get()
      if (knock && knock.status === 'pending') {
        useChatStore.getState().sendEvent('call:knock', { call_id: knock.callId })
      }
    },

    handleWsEvent: (event) => {
      const payload = event.payload as Record<string, unknown>
      const knock = knockHandlers[event.type]
      if (knock) return knock(payload)
      wsHandlers[event.type]?.({ payload, event, meId: useAuthStore.getState().user?.id })
    }
  }
})

// Atividades seguem a chamada atual: sair/trocar de chamada fecha o jogo aqui.
useCallStore.subscribe((s) => {
  useActivityStore.getState().setCall(s.status === 'idle' ? null : s.callId, voiceServerId(s))
})

// Os efeitos sonoros saem no mesmo dispositivo escolhido para as vozes.
setSoundOutput(useCallStore.getState().outputDeviceId)
setVoiceOutputDevice(useCallStore.getState().outputDeviceId)

// Dispositivo escolhido desconectado (ex.: tirou o headset): volta para o
// padrão do sistema em vez de ficar sem microfone/som.
if (typeof navigator !== 'undefined' && navigator.mediaDevices?.addEventListener) {
  navigator.mediaDevices.addEventListener('devicechange', () => {
    void navigator.mediaDevices.enumerateDevices().then((devices) => {
      const { inputDeviceId, outputDeviceId, setInputDevice, setOutputDevice } =
        useCallStore.getState()
      if (resolveDeviceId(devices, 'audioinput', inputDeviceId) !== inputDeviceId) {
        showToast.info('Microfone desconectado — usando o padrão do sistema.')
        void setInputDevice('')
      }
      if (resolveDeviceId(devices, 'audiooutput', outputDeviceId) !== outputDeviceId) {
        showToast.info('Saída de áudio desconectada — usando o padrão do sistema.')
        setOutputDevice('')
      }
      const { cameraId } = useVideoSettingsStore.getState()
      if (resolveDeviceId(devices, 'videoinput', cameraId) !== cameraId) {
        showToast.info('Câmera desconectada — usando a padrão do sistema.')
        void useCallStore.getState().setCameraDevice('')
      }
    })
  })
}

// Trocar o fundo com a câmera aberta: ligar/desligar o efeito troca o stream
// publicado (canvas x câmera crua, sem piscar, via replaceTrack). Mudar de
// imagem ou de desfoque para imagem não precisa: o pipeline lê o fundo a cada quadro.
useVideoSettingsStore.subscribe((state, prev) => {
  const changed = !sameBackground(state.background, prev.background)
  // Um GIF salvo que acabou de carregar do IndexedDB também liga o efeito sem trocar a escolha.
  const flipped =
    needsPipeline(state.background, state.customs) !== needsPipeline(prev.background, prev.customs)
  if (!changed && !flipped) return
  // Escolheu outro fundo: vale tentar de novo mesmo que o modelo tenha falhado antes.
  if (changed) effectUnavailable = false
  const call = useCallStore.getState()
  if (!localCameraStream || call.status !== 'active') return
  void enqueueCamera(async () => {
    if (wantsEffect() && !cameraPipeline) await addEffect()
    else if (!wantsEffect() && cameraPipeline) await dropEffect()
  })
})
