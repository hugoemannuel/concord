import { adaptSample, type MarkedCodec } from './screenAdaptSample'
import { ADAPT, adaptTick, initialAdapt, type AdaptState } from './screenAdaptController'
import { qualityLabel, qualityLadder } from './screenQualityLadder'
import { screenEncoding, type ScreenShareQuality } from './screenShareQuality'
import type { ScreenAdaptView } from '../store/screenAdaptStore'

// Liga o controlador de qualidade a uma live publicada: lê o envio a cada
// ADAPT.tickMs, troca de degrau ao vivo e conta para a UI o que está saindo.

export interface ScreenAdaptDeps {
  /** getStats() do envio da tela; null = não está mais publicada. */
  read(): Promise<RTCStatsReport | null>
  /** Aplica um degrau ao vivo (captura + encodings), sem despublicar. */
  apply(quality: ScreenShareQuality): Promise<void>
  report(view: ScreenAdaptView): void
  /** Uma live saiu pelo processador (chamado uma vez por live): as próximas evitam o codec (AV1/H.265) ou a camada extra de 720p (H.264). */
  softwareCodec(codec: MarkedCodec): void
}

export class ScreenAdapt {
  private state: AdaptState = initialAdapt()
  private ladder: ScreenShareQuality[]
  private timer: ReturnType<typeof setInterval> | null = null
  private busy = false
  /** A queda para o processador já foi repassada nesta live (uma vez só, ADR 0073). */
  private softwareSeen = false

  constructor(
    private readonly deps: ScreenAdaptDeps,
    private chosen: ScreenShareQuality,
    private readonly source: MediaTrackSettings,
    private readonly simulcast: boolean
  ) {
    this.ladder = qualityLadder(chosen, source, simulcast)
  }

  start(): void {
    this.timer = setInterval(() => void this.tick(), ADAPT.tickMs)
    this.emit()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  /** A pessoa escolheu outra qualidade (já aplicada por quem chamou). */
  choose(chosen: ScreenShareQuality): void {
    this.chosen = chosen
    this.ladder = qualityLadder(chosen, this.source, this.simulcast)
    this.state = { ...initialAdapt(), hold: ADAPT.hold }
    this.emit()
  }

  chosenQuality(): ScreenShareQuality {
    return this.chosen
  }

  effective(): ScreenShareQuality {
    return this.ladder[this.state.step] ?? this.chosen
  }

  private emit(): void {
    const effective = this.effective()
    this.deps.report({
      chosen: qualityLabel(this.chosen, this.source),
      effective: qualityLabel(effective, this.source),
      reduced: this.state.step > 0,
      reason: this.state.reason,
      step: this.state.step
    })
  }

  private async tick(): Promise<void> {
    if (this.busy || !this.timer) return
    this.busy = true
    try {
      await this.step()
    } catch {
      /* Leitura ou troca falhou: tenta de novo na próxima leitura. */
    } finally {
      this.busy = false
    }
  }

  private async step(): Promise<void> {
    const report = await this.deps.read()
    if (!report || !this.timer) return
    const sample = adaptSample(report, screenEncoding(this.effective(), this.source).maxBitrate)
    if (sample?.softwareCodec && !this.softwareSeen) {
      this.softwareSeen = true
      this.deps.softwareCodec(sample.softwareCodec)
    }
    const before = this.state
    this.state = adaptTick(before, sample, this.ladder.length)
    if (this.state.step !== before.step) {
      try {
        await this.deps.apply(this.effective())
      } catch (error) {
        this.state = { ...this.state, step: before.step }
        throw error
      }
    }
    if (this.state.step !== before.step || this.state.reason !== before.reason) this.emit()
  }
}
