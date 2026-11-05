import { Track, type LocalParticipant } from 'livekit-client'
import {
  publishScreenTracks,
  republishScreenVideo,
  updatePublishedScreenQuality,
  type ScreenPublishPlan
} from './screenPublish'
import {
  captureSize,
  screenEncoding,
  screenSource,
  screenVideoConstraints,
  streamQuality,
  type ScreenShareQuality
} from './screenShareQuality'
import { loadScreenCodec, screenCodecOptions } from './screenCodec'
import {
  detectHighH264,
  detectScreenCodecs,
  markSoftwareCodec,
  softwareMarkedCodecs,
  type ScreenVideoCodec,
  type ScreenVideoShape
} from './screenCodecSupport'
import { syncScreenScales } from './screenScaleSync'
import { describeCodecChoice, noteScreenCodecChoice } from './screenCodecChoice'
import { screenSound } from './screenSound'
import { chooseScreenSimulcast, loadScreenSimulcast } from './screenSimulcast'
import { ScreenAdapt } from './screenAdapt'
import { senderReports } from './screenStatsSource'
import { encoderInfoFromReport, type ScreenEncoderInfo } from './screenEncoderInfo'
import { CodecGuard } from './screenCodecGuard'
import { useScreenAdaptStore, type ScreenAdaptView } from '../store/screenAdaptStore'
import {
  useScreenCodecFallbackStore,
  type CodecFallback
} from '../store/screenCodecFallbackStore'

// A minha live na sala: publicar (codec e camadas), trocar a qualidade ao vivo
// sem despublicar, o controlador que desce/sobe de degrau sozinho e a
// republicação num codec seguro quando o navegador troca o codec sozinho. O
// CallMedia delega para cá (o livekit.ts não cresce com a tela). Ver
// docs/adr/0020 e 0048.

/** O tamanho da live, como a detecção de codecs pergunta. */
function videoShape(quality: ScreenShareQuality, settings: MediaTrackSettings): ScreenVideoShape {
  const { width, height } = captureSize(quality.resolution, settings)
  const bitrate = screenEncoding(quality, settings).maxBitrate
  return { width, height, bitrate, framerate: quality.frameRate }
}

/** Codec e camadas da live (sem os codecs que já falharam nela) e anota o porquê. */
async function screenPlan(
  stream: MediaStream,
  failed: readonly ScreenVideoCodec[]
): Promise<ScreenPublishPlan> {
  const [video] = stream.getVideoTracks()
  const quality = streamQuality(stream)
  const settings = video?.getSettings() ?? {}
  const shape = videoShape(quality, settings)
  const support = await detectScreenCodecs(shape)
  const preference = loadScreenCodec()
  const mode = loadScreenSimulcast()
  const simulcast = chooseScreenSimulcast(mode, quality, settings, support, preference)
  const codec = screenCodecOptions(preference, support, simulcast, failed)
  const marked = softwareMarkedCodecs()
  const sound = screenSound(stream)
  noteScreenCodecChoice(
    describeCodecChoice({ preference, support, simulcast, codec, marked, sound })
  )
  return { codec, simulcast, h264High: await detectHighH264(shape) }
}

export class ScreenSender {
  private adapt: ScreenAdapt | null = null
  private stream: MediaStream | null = null
  /** Trocas de qualidade (minhas e do controlador) uma de cada vez. */
  private queue: Promise<void> = Promise.resolve()
  private view: ScreenAdaptView | null = null
  /** Codec principal da live publicada ('h265'). */
  private codec: ScreenVideoCodec = 'vp8'
  /** Codecs que o navegador trocou sozinho nesta live (não voltam nela). */
  private failed: ScreenVideoCodec[] = []
  private guard: CodecGuard | null = null
  private republishing = false

  constructor(
    private readonly participant: LocalParticipant,
    /** A sala continua conectada (senão a troca é abandonada). */
    private readonly connected: () => boolean,
    private readonly onView: (view: ScreenAdaptView | null) => void = (view) =>
      useScreenAdaptStore.getState().setView(view),
    private readonly onFallback: (fallback: CodecFallback | null) => void = (fallback) =>
      useScreenCodecFallbackStore.getState().setFallback(fallback)
  ) {}

  async publish(stream: MediaStream): Promise<void> {
    const [video] = stream.getVideoTracks()
    this.failed = []
    this.onFallback(null)
    const plan = await screenPlan(stream, this.failed)
    this.published(plan)
    await publishScreenTracks(this.participant, stream, plan)
    if (video) this.watch(stream, streamQuality(stream), screenSource(video), plan.simulcast)
  }

  /** Não despublica: preserva SID, tracks e assinaturas de quem já está assistindo. */
  update(stream: MediaStream, quality: ScreenShareQuality): Promise<void> {
    return this.enqueue(async () => {
      await updatePublishedScreenQuality(this.participant, stream, quality, this.connected)
      if (this.stream === stream) this.adapt?.choose(quality)
    })
  }

  /** Qualidade saindo agora (painel de estatísticas). */
  current(): ScreenAdaptView | null {
    return this.view
  }

  /** O que estou codificando (quem assiste pergunta por RPC); null = sem live. */
  async encoderInfo(): Promise<ScreenEncoderInfo | null> {
    const track = this.participant.getTrackPublication(Track.Source.ScreenShare)?.videoTrack
    if (!track) return null
    return encoderInfoFromReport(
      await senderReports(track),
      this.view?.effective ?? null,
      this.codec
    )
  }

  /** Parou de transmitir (sem stream: qualquer uma). */
  stop(stream?: MediaStream): void {
    if (stream && stream !== this.stream) return
    this.adapt?.stop()
    this.adapt = null
    this.stream = null
    this.guard = null
    this.report(null)
    this.onFallback(null)
  }

  private published(plan: ScreenPublishPlan): void {
    this.codec = plan.codec.videoCodec
    this.guard = new CodecGuard(this.codec)
  }

  /**
   * O navegador trocou o codec sozinho (o codificador da placa falhou): quem
   * assiste negociou o publicado e fica com a tela preta. Marca o codec neste
   * aparelho e republica no próximo seguro (H.264, depois VP8), sem a pessoa
   * fazer nada.
   */
  private async fallback(stream: MediaStream): Promise<void> {
    const from = this.failed[0] ?? this.codec
    this.failed.push(this.codec)
    markSoftwareCodec(this.codec)
    this.guard = null
    this.republishing = true
    try {
      await this.enqueue(async () => {
        if (this.stream !== stream) return
        const video = stream.getVideoTracks()[0]
        const quality = this.adapt?.chosenQuality() ?? streamQuality(stream)
        // A nova publicação recomeça no escolhido: a captura volta para ele.
        await video.applyConstraints(screenVideoConstraints(quality, screenSource(video)))
        const plan = await screenPlan(stream, this.failed)
        await republishScreenVideo(this.participant, stream, plan)
        this.published(plan)
        this.onFallback({ from, to: plan.codec.videoCodec })
        this.watch(stream, quality, screenSource(video), plan.simulcast)
      })
    } finally {
      this.republishing = false
    }
  }

  /** A cada leitura do controlador: o codec que sai ainda é o publicado? */
  private inspect(stream: MediaStream, report: RTCStatsReport): void {
    if (this.republishing || this.codec === 'vp8' || !this.guard?.check(report)) return
    void this.fallback(stream).catch(() => {})
  }

  private report(view: ScreenAdaptView | null): void {
    this.view = view
    this.onView(view)
  }

  private enqueue(task: () => Promise<void>): Promise<void> {
    const run = this.queue.then(task, task)
    this.queue = run.catch(() => {})
    return run
  }

  private watch(
    stream: MediaStream,
    quality: ScreenShareQuality,
    source: MediaTrackSettings,
    simulcast: boolean
  ): void {
    this.adapt?.stop()
    this.stream = stream
    this.adapt = new ScreenAdapt(
      {
        read: () => this.readSender(stream),
        apply: (step) =>
          this.enqueue(() =>
            updatePublishedScreenQuality(
              this.participant,
              stream,
              step,
              this.connected,
              this.adapt?.chosenQuality().frameRate
            )
          ),
        report: (view) => this.report(view),
        softwareCodec: markSoftwareCodec
      },
      quality,
      source,
      simulcast
    )
    this.adapt.start()
  }

  /**
   * Só o envio principal: a reserva (720p30 fixa, ver screenBackup) não tem
   * degrau para descer, e ler a dela faria o principal descer à toa.
   */
  private async readSender(stream: MediaStream): Promise<RTCStatsReport | null> {
    const track = this.participant.getTrackPublication(Track.Source.ScreenShare)?.videoTrack
    if (!track || track.mediaStreamTrack !== stream.getVideoTracks()[0]) return null
    const report = (await track.getRTCStatsReport()) ?? null
    if (report) this.inspect(stream, report)
    if (!this.republishing) void this.enqueue(() => syncScreenScales(track)).catch(() => {})
    return report
  }
}
