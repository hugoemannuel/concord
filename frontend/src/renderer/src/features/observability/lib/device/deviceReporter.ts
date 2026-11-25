import type { DeviceTake, GpuStatus } from '../../../../../../shared/deviceStats'
import type { ClientContext } from '../telemetryTypes'
import { DeviceBatchQueue } from './deviceBatch'
import { leftCallOrLive, rowSecondsFor, sameLabel } from './deviceState'
import type { DeviceBatch, DeviceLabel, DeviceSession, RendererMeasures } from './deviceTypes'
import { mainMeasuresOf } from './mainMeasures'
import { webGpuStatus } from './webGpuStatus'

// Cadência das linhas do aparelho (docs/adr/0069): o timer de 60 s confere se
// a linha venceu (60 s em call/live, 300 s parado); mudar o que a pessoa faz
// fecha antes. Ao fechar, junta o que o renderer mediu com a take do main.

export const ROW_TICK_MS = 60_000
/** Timer de 60 s um pouco adiantado ainda fecha a linha de 60 s. */
const DUE_SLACK_MS = 5_000
/** Linha mais curta que isso não fecha ao mudar o estado: só troca o rótulo. */
const MIN_ROW_MS = 5_000
const MAX_ROW_S = 900

export interface ReporterDeps {
  now(): number
  label(): DeviceLabel
  /** Fecha a medição do renderer (RendererMeter.take). */
  measures(): RendererMeasures
  /** window.api.deviceStats.take(); null no web. */
  takeMain(): Promise<DeviceTake | null>
  context(): Promise<ClientContext>
  send(batch: DeviceBatch): Promise<void>
  sessionId: string
  web: boolean
  /** Web: ms da navegação até a lista de servidores (null se não medido). */
  webStartupMs(): number | null
}

export class DeviceReporter {
  private readonly queue = new DeviceBatchQueue()
  private label: DeviceLabel
  private rowStart: number
  private memTotalMB: number | null = null
  private gpuStatus: GpuStatus | null = null
  private startupMs: number | null = null
  private context: Promise<ClientContext> | null = null
  private sending = false
  private stopped = false

  constructor(private readonly deps: ReporterDeps) {
    this.label = deps.label()
    this.rowStart = deps.now()
  }

  /** A primeira take liga o amostrador de 15 s do main; o resultado (vazio) é descartado. */
  async arm(): Promise<void> {
    await this.takeMain()
  }

  async tick(): Promise<void> {
    const due = rowSecondsFor(this.label.state) * 1000 - DUE_SLACK_MS
    if (this.deps.now() - this.rowStart >= due) await this.closeRow(this.label)
    await this.maybeSend()
  }

  async labelChanged(): Promise<void> {
    const before = this.label
    const next = this.deps.label()
    if (this.stopped || sameLabel(before, next)) return
    this.label = next
    if (leftCallOrLive(before.state, next.state)) this.queue.noteLeftCall()
    if (this.deps.now() - this.rowStart >= MIN_ROW_MS) await this.closeRow(before)
    await this.maybeSend()
  }

  stop(): void {
    this.stopped = true
    this.queue.clear()
  }

  private async closeRow(label: DeviceLabel): Promise<void> {
    const now = this.deps.now()
    const seconds = Math.min(MAX_ROW_S, Math.max(1, Math.round((now - this.rowStart) / 1000)))
    const renderer = this.deps.measures()
    this.rowStart = now
    const main = mainMeasuresOf(await this.takeMain())
    if (this.stopped) return
    this.queue.push({ closedAt: now, sample: { seconds, ...label, ...renderer, ...main } })
  }

  private async takeMain(): Promise<DeviceTake | null> {
    const take = await this.deps.takeMain().catch(() => null)
    if (take) this.noteTake(take)
    return take
  }

  private noteTake(take: DeviceTake): void {
    this.memTotalMB = take.sys.memTotalMB
    this.gpuStatus = take.gpuStatus
    this.startupMs ??= take.startupMs
  }

  private async maybeSend(): Promise<void> {
    const now = this.deps.now()
    if (this.stopped || this.sending || !this.queue.due(now)) return
    this.sending = true
    try {
      const samples = this.queue.drain(now)
      if (samples.length > 0) await this.deps.send({ session: await this.session(), samples })
    } catch {
      // Falha de envio descarta o lote: é só telemetria.
    } finally {
      this.sending = false
    }
  }

  private async session(): Promise<DeviceSession> {
    this.context ??= this.deps.context()
    const ctx = await this.context
    return {
      id: this.deps.sessionId,
      os: ctx.os,
      app_version: ctx.app_version,
      target: ctx.target,
      gpu: ctx.gpu,
      cores: ctx.cores,
      mem_total_mb: this.memTotalMB,
      startup_ms: this.startupMs ?? this.deps.webStartupMs(),
      gpu_status: this.gpuStatus ?? (this.deps.web ? webGpuStatus(ctx.gpu) : '')
    }
  }
}
