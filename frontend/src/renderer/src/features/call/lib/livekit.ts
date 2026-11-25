import {
  ConnectionState,
  DisconnectReason,
  Room,
  RoomEvent,
  Track
} from 'livekit-client'
import { RemoteSubscriptions } from './remoteSubscriptions'
import { ScreenReceiveWatch } from './screenReceiveWatch'
import { reportHevcDecodeFailure } from './screenHevcFailure'
import { watchVideoPause } from './screenVideoPause'
import { groupTracks, listScreenPublishers, StreamCache, type MediaKind } from './callMedia'
import { remoteEntries } from './remoteEntries'
import { isScreenHelper } from './screenIdentity'
import { canPublishSource, type PublishSource } from './mediaPermissions'
import { asCallQuality, type CallQuality, type QualityDetails } from './connectionQuality'
import { CallQualityReader } from './callQualityReader'
import { MicPublisher } from './micPublisher'
import type { ScreenShareQuality } from './screenShareQuality'
import { ScreenSender } from './screenSender'
import type { ScreenEncoderInfo } from './screenEncoderInfo'
import type { ScreenStatsInput } from './screenStats'
import { RemoteEncoders, serveScreenEncoder } from './screenEncoderRpc'
import { readCallReport } from './callStatsReport'
import {
  clearActiveScreenStats,
  readScreenStatsInput,
  setActiveScreenStats
} from './screenStatsSource'

// Mídia das chamadas via SFU (LiveKit): cada pessoa envia uma cópia de cada
// track para o servidor, que distribui para os demais. Substitui o mesh P2P.

export interface RemoteMedia {
  /** userId -> microfone */
  streams: Record<string, MediaStream>
  /** userId -> vídeo da tela */
  screenStreams: Record<string, MediaStream>
  /** userId -> som da tela (jogo, vídeo…) */
  screenAudioStreams: Record<string, MediaStream>
  /** userId -> câmera */
  videoStreams: Record<string, MediaStream>
  /** userId -> nome de quem está na sala de mídia (com ou sem tracks) */
  mediaPeers: Record<string, string>
  /** userIds com tela publicada (assistida ou não — a não assistida não é baixada) */
  availableScreens: string[]
  /**
   * Sala reconectando: os participantes somem por um instante sem terem saído
   * nem parado de transmitir — quem assiste não deve perder o que assistia.
   */
  reconnecting?: boolean
}

export interface CallMediaHandlers {
  onRemoteMedia: (media: RemoteMedia) => void
  /**
   * Queda que o LiveKit não conseguiu recuperar (não chamado em disconnect()).
   * `reason`: DisconnectReason do SDK, quando ele informa.
   */
  onConnectionLost: (reason?: number) => void
  /** O canal de controle com o servidor de voz abriu; falta a mídia (WebRTC). */
  onSignalConnected?: () => void
  /** Qualidade da conexão de alguém mudou (identity = userId, inclusive o próprio). */
  onConnectionQuality?: (userId: string, quality: CallQuality) => void
  onReconnecting: () => void
  onReconnected: () => void
  /** Quem está falando agora (identity = userId), incluindo o próprio usuário. */
  onActiveSpeakers: (userIds: string[]) => void
  /**
   * As permissões de publicação do próprio usuário mudaram (cargo novo, canal
   * mudou, "silenciar no servidor"). Também chamado depois de conectar.
   */
  onPublishPermissions?: (allowed: { microphone: boolean; stream: boolean }) => void
  /** Um moderador tirou o usuário da sala (Desconectar da chamada). */
  onRemovedByModerator?: () => void
}

/** A minha live pelo helper nativo, como a CallMedia a enxerga. */
export interface NativeScreen {
  /** Identidade do helper na sala (`<meu id>:screen`). */
  identity: string
  statsInput(): ScreenStatsInput | null
  encoderInfo(): ScreenEncoderInfo | null
}

export class CallMedia {
  private room: Room
  private cache = new StreamCache<MediaStream>((tracks) => new MediaStream(tracks))
  private closing = false
  /** Tela/câmera pedidas antes disso são publicadas por quem chamou connect(). */
  private connected = false
  /** O que baixar de cada pessoa (tela só de quem assisto; vídeo pausado fora de vista). */
  private subscriptions = new RemoteSubscriptions()
  /** O decodificador dá conta das lives que assisto? (camada baixa, H.265; ADR 0073) */
  private receiveWatch = new ScreenReceiveWatch({
    // A prévia da minha live nativa não conta (é o meu próprio envio).
    participants: () =>
      [...this.room.remoteParticipants.values()].filter((p) => p.identity !== this.nativeScreen?.identity),
    onOverload: (identity, low) => {
      this.subscriptions.setDecodeLimited(identity, low)
      this.applySubscriptions()
    },
    onHevcFailed: (userId, rates) => void reportHevcDecodeFailure(userId, rates)
  })
  private stopWindowWatch: () => void
  private refreshQueued = false
  private mic = new MicPublisher(() => this.room.localParticipant)
  /** Latência e perda de pacotes (tooltip de conexão ruim). */
  private quality: CallQualityReader
  /** A minha live (publicar e trocar a qualidade ao vivo). */
  private screen: ScreenSender
  /** O codificador de quem transmite, para o painel "Recebendo" (por RPC). */
  private remoteEncoders: RemoteEncoders
  /** A minha live pelo helper nativo (ADR 0031): identidade dele e o que ele mede. */
  private nativeScreen: NativeScreen | null = null

  constructor(private readonly handlers: CallMediaHandlers) {
    this.room = new Room({
      // Os streams vão para <video>/<audio> próprios da UI, não para elementos
      // anexados pelo SDK — adaptiveStream depende deles, então fica desligado.
      adaptiveStream: false,
      dynacast: true,
      publishDefaults: {
        dtx: true,
        red: true,
        simulcast: true,
        // A qualidade de tela é definida por publicação, não pela sala.
        videoCodec: 'vp8'
      }
    })
    this.quality = new CallQualityReader(this.room, () => this.closing)
    this.screen = new ScreenSender(
      this.room.localParticipant,
      () => this.connected && this.room.state === ConnectionState.Connected
    )
    setActiveScreenStats(this)
    this.remoteEncoders = new RemoteEncoders(this.room)
    serveScreenEncoder(this.room, async () =>
      this.nativeScreen ? this.nativeScreen.encoderInfo() : this.screen.encoderInfo()
    )
    this.receiveWatch.start()
    this.stopWindowWatch = watchVideoPause((pause) => {
      if (this.subscriptions.setPause(pause)) this.applySubscriptions()
    })

    // Rajadas de eventos viram uma emissão só, depois do handler do SDK. Numa
    // reconexão completa ele desmonta todos os participantes e só depois muda
    // o estado para Reconnecting — emitir no meio leria "pararam de transmitir".
    const refresh = (): void => {
      if (this.refreshQueued) return
      this.refreshQueued = true
      queueMicrotask(() => {
        this.refreshQueued = false
        if (!this.closing) this.emitRemoteMedia()
      })
    }
    const published = (): void => {
      this.applySubscriptions()
      refresh()
    }
    this.room
      .on(RoomEvent.TrackPublished, published)
      .on(RoomEvent.TrackUnpublished, refresh)
      .on(RoomEvent.TrackSubscribed, refresh)
      .on(RoomEvent.TrackUnsubscribed, refresh)
      .on(RoomEvent.TrackMuted, refresh)
      .on(RoomEvent.TrackUnmuted, refresh)
      .on(RoomEvent.ParticipantConnected, published)
      .on(RoomEvent.ParticipantDisconnected, refresh)
      .on(RoomEvent.ParticipantNameChanged, refresh)
      .on(RoomEvent.ParticipantPermissionsChanged, (_prev: unknown, participant?: unknown) => {
        // Só importam as permissões do próprio usuário.
        if (participant && participant !== this.room.localParticipant) return
        this.emitPublishPermissions()
      })
      .on(RoomEvent.SignalConnected, () => {
        if (!this.closing) this.handlers.onSignalConnected?.()
      })
      .on(
        RoomEvent.ConnectionQualityChanged,
        (quality: unknown, participant?: { identity?: string }) => {
          if (this.closing || !participant?.identity || isScreenHelper(participant.identity)) return
          this.handlers.onConnectionQuality?.(participant.identity, asCallQuality(quality))
        }
      )
      .on(RoomEvent.Reconnecting, () => this.handlers.onReconnecting())
      .on(RoomEvent.Reconnected, () => {
        // Assina de novo o que eu assistia e só então poda quem de fato parou.
        this.applySubscriptions()
        this.emitRemoteMedia()
        this.handlers.onReconnected()
      })
      .on(RoomEvent.ActiveSpeakersChanged, (speakers) =>
        this.handlers.onActiveSpeakers(speakers.map((p) => p.identity))
      )
      .on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
        if (this.closing || reason === DisconnectReason.CLIENT_INITIATED) return
        if (reason !== undefined && reason === DisconnectReason.PARTICIPANT_REMOVED) {
          this.handlers.onRemovedByModerator?.()
          return
        }
        this.handlers.onConnectionLost(reason)
      })
  }

  async connect(url: string, token: string, mic: MediaStreamTrack, muted: boolean): Promise<void> {
    // Assinatura manual: tela e som da tela só de quem estou assistindo.
    await this.room.connect(url, token, { autoSubscribe: false })
    // TrackPublished não dispara para o que já estava publicado ao entrar.
    this.applySubscriptions()
    this.mic.setTrack(mic)
    // Sem permissão de falar o microfone nem é publicado: a pessoa entra e
    // escuta. Se a permissão chegar depois, ensureMic publica.
    if (this.canPublish('microphone')) {
      await this.mic.publish(muted)
    }
    this.connected = true
    this.emitRemoteMedia()
    this.emitPublishPermissions()
  }

  /** RTT até o SFU pelas estatísticas públicas das tracks, inclusive em modo ouvinte. */
  getLatency(): Promise<number | null> {
    return this.quality.latency()
  }

  /** Perda de pacotes e latência para o tooltip de conexão ruim (ver CallQualityReader). */
  getQualityDetails(
    userIds: string[],
    selfId: string | null
  ): Promise<Record<string, QualityDetails>> {
    return this.quality.details(userIds, selfId)
  }

  /** getStats() do vídeo da live, para o painel de estatísticas (só com ele aberto). */
  async readScreenStats(userId: string, local: boolean): Promise<ScreenStatsInput | null> {
    if (this.closing) return null
    if (local && this.nativeScreen) return this.nativeScreen.statsInput()
    const input = await readScreenStatsInput(this.room, userId, local)
    if (!input) return null
    return input.local
      ? { ...input, quality: this.screen.current() }
      : { ...input, encoder: this.remoteEncoders.get(userId) }
  }

  /** getStats() da voz, para a telemetria das calls (features/observability). */
  readCallStats(): Promise<RTCStatsReport | null> {
    return this.closing ? Promise.resolve(null) : readCallReport(this.room)
  }

  /** Pode publicar essa fonte, segundo as permissões que o servidor deu. */
  canPublish(source: PublishSource): boolean {
    return canPublishSource(this.room.localParticipant.permissions, source)
  }

  private emitPublishPermissions(): void {
    this.handlers.onPublishPermissions?.({
      microphone: this.canPublish('microphone'),
      stream: this.canPublish('screen_share')
    })
  }

  /** Publica o microfone se agora pode e ainda não está publicado. */
  async ensureMic(muted: boolean): Promise<void> {
    if (!this.connected || !this.canPublish('microphone')) return
    await this.mic.ensure(muted)
  }

  setMicMuted(muted: boolean): Promise<void> {
    return this.mic.setMuted(muted)
  }

  /** Troca o microfone publicado (outro dispositivo) sem sair da sala. */
  replaceMic(track: MediaStreamTrack): Promise<void> {
    return this.mic.replace(track)
  }

  /**
   * Troca a câmera publicada (outro dispositivo ou o stream do efeito de fundo)
   * sem despublicar: SID e assinantes continuam. Sem câmera publicada não faz nada.
   */
  async replaceCamera(stream: MediaStream): Promise<void> {
    const [video] = stream.getVideoTracks()
    const publication = this.room.localParticipant.getTrackPublication(Track.Source.Camera)
    if (!video || !publication?.track) return
    // userProvidedTrack: o SDK não para a track antiga — o store é o dono.
    await publication.track.replaceTrack(video, true)
  }

  async publishScreen(stream: MediaStream): Promise<void> {
    if (!this.connected) return
    if (!this.canPublish('screen_share')) throw new Error('no_stream_permission')
    await this.screen.publish(stream)
  }

  async publishCamera(stream: MediaStream): Promise<void> {
    if (!this.connected) return
    if (!this.canPublish('camera')) throw new Error('no_stream_permission')
    const [video] = stream.getVideoTracks()
    if (!video) return
    await this.room.localParticipant.publishTrack(video, {
      source: Track.Source.Camera,
      name: 'camera'
    })
  }

  updateScreenQuality(stream: MediaStream, quality: ScreenShareQuality): Promise<void> {
    return this.screen.update(stream, quality)
  }

  /** Despublica as tracks do stream (quem chama é dono de parar as tracks). */
  async unpublish(stream: MediaStream): Promise<void> {
    this.screen.stop(stream)
    const tracks = stream.getTracks()
    if (!this.connected || tracks.length === 0) return
    await this.room.localParticipant.unpublishTracks(tracks)
  }

  /** A minha live passou a sair (ou deixou de sair) pelo helper nativo. */
  setNativeScreen(native: NativeScreen | null): void {
    this.nativeScreen = native
    this.subscriptions.setOwnScreen(native?.identity ?? null)
    this.applySubscriptions()
  }

  /** Passa a baixar a tela (e o som dela) só dessas pessoas. */
  setWatchedScreens(userIds: string[]): void {
    this.subscriptions.setWatched(userIds)
    this.applySubscriptions()
  }

  private applySubscriptions(): void {
    this.subscriptions.apply(this.room.remoteParticipants.values())
  }

  disconnect(): void {
    this.closing = true
    clearActiveScreenStats(this)
    this.receiveWatch.stop()
    this.screen.stop()
    this.stopWindowWatch()
    this.cache.clear()
    void this.room.disconnect()
  }

  private emitRemoteMedia(): void {
    const { entries, publications, mediaPeers } = remoteEntries(
      this.room.remoteParticipants.values(),
      this.nativeScreen?.identity ?? null
    )

    const grouped = groupTracks(entries)
    const inUse = new Set<string>()
    const toStreams = (kind: MediaKind): Record<string, MediaStream> => {
      const out: Record<string, MediaStream> = {}
      for (const [userId, tracks] of Object.entries(grouped[kind])) {
        const key = `${userId}:${kind}`
        inUse.add(key)
        out[userId] = this.cache.get(key, tracks)
      }
      return out
    }

    const availableScreens = listScreenPublishers(publications)
    const reconnecting = this.room.state !== ConnectionState.Connected
    // Parou de transmitir: sai dos assistidos — se voltar, começa pausada de novo.
    // Reconectando, a lista está vazia por engano: poda no Reconnected.
    if (!reconnecting) this.subscriptions.prune(availableScreens)

    const media: RemoteMedia = {
      streams: toStreams('voice'),
      screenStreams: toStreams('screen'),
      screenAudioStreams: toStreams('screenAudio'),
      videoStreams: toStreams('camera'),
      mediaPeers,
      availableScreens,
      reconnecting
    }
    this.cache.prune(inUse)
    this.handlers.onRemoteMedia(media)
  }
}
