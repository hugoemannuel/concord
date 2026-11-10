import type { CallInfo, CallStateResponse, StartCallInput } from '../api/calls'
import { useCallNoticeStore } from '../store/callNoticeStore'
import { isInCall, useCallSessionStore } from '../store/callSessionStore'
import { useIncomingCallStore } from '../store/incomingCallStore'
import { useParticipantsStore, voiceOf } from '../store/participantsStore'
import { useCameraStore } from '../store/cameraStore'
import { useScreenShareStore } from '../store/screenShareStore'
import { useSpeakingStore } from '../store/speakingStore'
import { useUserAudioStore } from '../store/userAudioStore'
import { callErrorMessage } from './callErrors'
import { resyncCall } from './callResync'
import { mergeMediaPeers } from './mediaPeers'
import { playSound } from './sounds/soundPlayer'
import type { CallMedia, MediaConnection } from './callMedia'
import { outputVolume } from './userVolume'
import { effectiveAudio, type LocalControls } from './voiceState'

export interface ControllerDeps {
  api: {
    startCall: (input: StartCallInput) => Promise<CallInfo>
    getCallToken: (callId: string) => Promise<{ token: string }>
    endCallRequest: (callId: string) => Promise<unknown>
    getCallState: (callId: string) => Promise<CallStateResponse>
  }
  media: CallMedia
  ws: { send: (type: string, payload: unknown) => void; subscribe: (room: string) => void; unsubscribe: (room: string) => void }
  liveKitUrl: string
  /** Mudo e fone do painel do usuário (voiceControlsStore). */
  controls: () => LocalControls
  ensureMicPermission: () => Promise<boolean>
  ensureCameraPermission: () => Promise<boolean>
  meId?: () => string | null
}

export interface ChannelTarget {
  id: string
  name: string
  serverId: string
}

export interface DmTarget {
  id: string
  name: string
}

const session = () => useCallSessionStore.getState()
const notice = (message: string): void => useCallNoticeStore.getState().show(message)

/**
 * Orquestra a chamada: API, sala de eventos, mídia e stores. Fábrica com dependências injetadas para testar
 * com mídia e API falsas (ADR 0023); `callRuntime.ts` monta a instância real.
 */
export function createCallController(deps: ControllerDeps) {
  /** Chamada cuja mídia já foi (ou está sendo) conectada: evita conectar duas vezes. */
  let mediaCallId: string | null = null

  deps.media.onSpeakers((ids) => useSpeakingStore.getState().set(ids))
  deps.media.onConnection((state) => onMediaConnection(state))
  deps.media.onScreens((ids) => onScreens(ids))
  deps.media.onPeers((peers) => onPeers(peers))
  deps.media.onCameras((ids) => useCameraStore.getState().setCameras(ids))
  // Volume e silenciar de cada pessoa (só para mim): manda para a mídia só quem mudou.
  useUserAudioStore.subscribe(({ settings }, prev) => {
    for (const [userId, audio] of Object.entries(settings)) {
      if (audio !== prev.settings[userId]) deps.media.setUserVolume(userId, outputVolume(audio))
    }
  })

  /** Muda a lista de quem transmite: toca o som de quando alguém abre ou encerra uma transmissão. */
  /** A sala de mídia manda quem está nela: o Maestro entra e sai da lista por aqui. */
  function onPeers(peers: Record<string, string>): void {
    if (session().phase === 'idle') return
    const store = useParticipantsStore.getState()
    const merged = mergeMediaPeers(store.people, peers, deps.meId?.() ?? null)
    if (merged !== store.people) store.replace(merged, store.voice)
  }

  function onScreens(ids: string[]): void {
    const before = useScreenShareStore.getState().sharers
    const me = deps.meId?.() ?? null
    const others = (list: string[]): string[] => list.filter((id) => id !== me)
    useScreenShareStore.getState().setSharers(ids)
    if (others(ids).length > others(before).length) playSound('liveStart')
    else if (others(ids).length < others(before).length) playSound('liveEnd')
  }

  function onMediaConnection(state: MediaConnection): void {
    const { phase } = session()
    if (state === 'reconnecting' && phase === 'active') session().setPhase('reconnecting')
    else if (state === 'connected' && phase === 'reconnecting') session().setPhase('active')
    else if (state === 'replaced' && isInCall({ phase })) {
      // A conta continua na chamada pelo outro aparelho: sair sem call:leave, senão o servidor tira os dois.
      notice('Você entrou nesta chamada em outro aparelho.')
      void leave(false)
    } else if (state === 'disconnected' && isInCall({ phase }) && phase !== 'outgoing') {
      notice('A conexão com a chamada caiu.')
      void leave()
    }
  }

  async function applyAudio(): Promise<void> {
    const s = session()
    if (!s.callId || mediaCallId !== s.callId) return
    const local = deps.controls()
    const server = voiceOf(useParticipantsStore.getState().voice, deps.meId?.() ?? '')
    const { micOn, listening } = effectiveAudio(local, server, !s.micDenied)
    deps.media.setListening(listening)
    await deps.media.setMicEnabled(micOn).catch(() => {})
    deps.ws.send('call:voice', { call_id: s.callId, muted: local.muted, deafened: local.deafened })
  }

  async function connectMedia(callId: string): Promise<void> {
    if (mediaCallId === callId) return
    mediaCallId = callId
    const { token } = await deps.api.getCallToken(callId)
    await deps.media.connect(deps.liveKitUrl, token)
    if (session().callId !== callId) return void (await deps.media.disconnect())
    if (session().micDenied) notice('Sem permissão do microfone. Você entrou mudo.')
    session().setPhase('active')
    playSound('join')
    await applyAudio()
  }

  async function fail(err: unknown): Promise<void> {
    notice(callErrorMessage(err))
    await leave()
  }

  /** `notify: false` quando o servidor já me tirou da chamada (movido por um moderador, por exemplo). */
  async function leave(notify = true): Promise<void> {
    const s = session()
    if (s.phase === 'idle') return
    const callId = s.callId
    const wasSharing = useScreenShareStore.getState().sharing
    const cameraOn = useCameraStore.getState().on
    if (s.phase === 'active' || s.phase === 'reconnecting') playSound('leave')
    mediaCallId = null
    s.reset()
    useParticipantsStore.getState().reset()
    useSpeakingStore.getState().reset()
    useScreenShareStore.getState().reset()
    useCameraStore.getState().reset()
    if (callId) {
      if (notify) deps.ws.send('call:leave', { call_id: callId })
      deps.ws.unsubscribe(`call:${callId}`)
    }
    // Transmitindo, desliga a captura antes de desconectar: sem isso o serviço de captura de tela do Android fica preso.
    if (wasSharing) await deps.media.setScreenShareEnabled(false).catch(() => {})
    if (cameraOn) await deps.media.setCameraEnabled(false).catch(() => {})
    await deps.media.disconnect().catch(() => {})
  }

  /** Monta a lista de quem já está na chamada (e quem está mudo); erro de rede não impede de entrar. */
  function loadRoster(): Promise<void> {
    return resyncCall({ getState: deps.api.getCallState, meId: deps.meId?.() ?? null, onEnded: () => void leave(false) }).catch(() => {})
  }

  /**
   * Pede o microfone antes de começar qualquer fase da chamada: o serviço em primeiro plano (tipo microfone) sobe
   * com a fase, e subir sem a permissão faz o Android 14 derrubar o app. Devolve se foi negado.
   */
  async function askMic(): Promise<boolean> {
    return !(await deps.ensureMicPermission())
  }

  async function joinChannel(channel: ChannelTarget): Promise<void> {
    const s = session()
    if (isInCall(s) && s.channelId === channel.id) return
    if (session().phase !== 'idle') await leave()
    const micDenied = await askMic()
    session().begin({ callId: '', kind: 'channel', phase: 'connecting', channelId: channel.id, serverId: channel.serverId, name: channel.name, micDenied })
    try {
      const call = await deps.api.startCall({ type: 'channel', channel_id: channel.id })
      session().setCallId(call.id)
      deps.ws.subscribe(`call:${call.id}`)
      // Quem já está na chamada só chega por esta busca (os eventos call:joined são de quem entra depois de mim).
      await Promise.all([loadRoster(), connectMedia(call.id)])
    } catch (err) {
      await fail(err)
    }
  }

  async function callDm(dm: DmTarget): Promise<void> {
    // O servidor me tira da call em que eu estava (estilo Discord): só desliga aqui.
    if (session().phase !== 'idle') await leave(false)
    const micDenied = await askMic()
    session().begin({ callId: '', kind: 'dm', phase: 'outgoing', conversationId: dm.id, name: dm.name, micDenied })
    try {
      const call = await deps.api.startCall({ type: 'dm', conversation_id: dm.id })
      session().setCallId(call.id)
      deps.ws.subscribe(`call:${call.id}`)
    } catch (err) {
      await fail(err)
    }
  }

  /** Alguém atendeu a DM que eu iniciei (fase `connecting` sem mídia ainda): conecta. */
  async function connectIfNeeded(): Promise<void> {
    const s = session()
    if (s.phase !== 'connecting' || !s.callId) return
    try {
      await connectMedia(s.callId)
    } catch (err) {
      await fail(err)
    }
  }

  async function acceptIncoming(): Promise<void> {
    const incoming = useIncomingCallStore.getState().call
    if (!incoming) return
    // O servidor me tira da call em que eu estava ao atender: só desliga aqui.
    if (session().phase !== 'idle') await leave(false)
    useIncomingCallStore.getState().clear()
    const micDenied = await askMic()
    session().begin({
      callId: incoming.callId,
      kind: 'dm',
      phase: 'connecting',
      conversationId: incoming.conversationId,
      name: incoming.initiator.display_name,
      micDenied
    })
    useParticipantsStore.getState().upsert(incoming.initiator)
    deps.ws.send('call:accept', { call_id: incoming.callId })
    deps.ws.subscribe(`call:${incoming.callId}`)
    await connectIfNeeded()
  }

  function declineIncoming(): void {
    const incoming = useIncomingCallStore.getState().call
    if (!incoming) return
    deps.ws.send('call:decline', { call_id: incoming.callId })
    useIncomingCallStore.getState().clear()
  }

  /** Um moderador me moveu: o servidor já me pôs no canal novo, então só troco a mídia. */
  async function followMove(): Promise<void> {
    const { movedTo, serverId } = session()
    if (!movedTo || !serverId) return
    await leave(false)
    await joinChannel({ id: movedTo.channelId, name: movedTo.name, serverId })
  }

  /** Liga ou desliga a transmissão da minha tela; sem permissão de captura, avisa e fica desligada. */
  async function toggleScreenShare(): Promise<void> {
    const store = useScreenShareStore.getState()
    const next = !store.sharing
    try {
      await deps.media.setScreenShareEnabled(next)
      store.setSharing(next)
      // O servidor precisa saber (como no desktop): sem isso, quem clica em Assistir recebe erro e cai da chamada.
      const callId = session().callId
      if (callId) deps.ws.send('call:screen', { call_id: callId, active: next })
      if (next) playSound('liveStart')
    } catch {
      store.setSharing(false)
      // A captura pode ter começado antes da falha (a chamada caiu no meio): desliga para não deixar o serviço de tela preso.
      await deps.media.setScreenShareEnabled(false).catch(() => {})
      notice('Não foi possível transmitir a tela. Permita a captura de tela quando o Android pedir.')
    }
  }

  /** Liga ou desliga a minha câmera; sem permissão ou com a câmera ocupada, avisa e fica desligada. */
  async function toggleCamera(): Promise<void> {
    const store = useCameraStore.getState()
    const next = !store.on
    if (next && !(await deps.ensureCameraPermission())) return notice('Sem permissão da câmera. Libere nas configurações do Android.')
    try {
      await deps.media.setCameraEnabled(next)
      store.setOn(next)
    } catch {
      store.setOn(false)
      await deps.media.setCameraEnabled(false).catch(() => {})
      notice('Não foi possível ligar a câmera.')
    }
  }

  async function flipCamera(): Promise<void> {
    await deps.media.flipCamera().catch(() => notice('Não foi possível trocar de câmera.'))
  }

  /** Assiste à transmissão de alguém (null para de assistir). Uma de cada vez. */
  function watchScreen(userId: string | null): void {
    const store = useScreenShareStore.getState()
    if (store.watching && store.watching !== userId) deps.media.watchScreen(store.watching, false)
    if (userId) deps.media.watchScreen(userId, true)
    store.setWatching(userId)
  }

  return { joinChannel, callDm, connectIfNeeded, acceptIncoming, declineIncoming, leave, applyAudio, followMove, toggleScreenShare, watchScreen, toggleCamera, flipCamera }
}

export type CallController = ReturnType<typeof createCallController>
