import type { ProcessMetric } from 'electron'
import type { DeviceTake, GpuStatus } from '../../shared/deviceStats'
import type { ProcStats } from '../../shared/perfLog'
import { ProcessBreakdown } from '../perf/processBreakdown'
import { DeviceAggregate, type DeviceReading } from './deviceAggregate'
import type { HelperSampler } from './linuxHelpers'
import { SystemCpu } from './systemCpu'

// Amostrador das métricas do aparelho (docs/adr/0069): lê a cada 15 s, mas só
// depois da primeira take (o renderer pede só com alguém logado). Antes disso
// nada roda; os eventos (travada, GPU que caiu) só somam contadores. 10 min
// sem take (logout, renderer parado) desliga o timer; a próxima take religa.

export const SAMPLE_MS = 15_000
export const IDLE_STOP_MS = 10 * 60_000
const MB = 1024 * 1024

type Metric = Pick<ProcessMetric, 'pid' | 'creationTime' | 'memory' | 'cpu' | 'type'>
type CpuTimes = Parameters<SystemCpu['sample']>[0][number]

export interface SamplerDeps {
  appMetrics(): Metric[]
  cpus(): CpuTimes[]
  /** Bytes (os.freemem / os.totalmem). */
  freeMem(): number
  totalMem(): number
  /** Carga de 1 min; null onde não existe (Windows). */
  loadAvg(): number | null
  onBattery(): boolean | null
  /** Só no Linux. */
  helpers: Pick<HelperSampler, 'sample'> | null
  gpuStatus(): GpuStatus
  /** ms monotônico. */
  now(): number
  /** Liga um timer; devolve o "desligar". */
  every(ms: number, fn: () => void): () => void
  cores: number
}

const sumOrNull = (a: number | null, b: number | null): number | null =>
  a === null && b === null ? null : (a ?? 0) + (b ?? 0)

/** ProcStats (por tipo do Electron) nos grupos do contrato: Utility+Other → other. */
export function processReading(
  procs: ProcStats
): Pick<DeviceReading, 'cpu' | 'memAppMB' | 'memRendererMB' | 'memGpuMB'> {
  const cpuOf = (type: string): number | null => procs[type]?.cpu ?? null
  const groups = Object.values(procs)
  return {
    cpu: {
      browser: cpuOf('Browser'),
      renderer: cpuOf('Tab'),
      gpu: cpuOf('GPU'),
      other: sumOrNull(cpuOf('Utility'), cpuOf('Other'))
    },
    memAppMB: groups.length > 0 ? groups.reduce((sum, g) => sum + g.memMB, 0) : null,
    memRendererMB: procs['Tab']?.memMB ?? null,
    memGpuMB: procs['GPU']?.memMB ?? null
  }
}

export class DeviceSampler {
  private readonly breakdown = new ProcessBreakdown()
  private readonly systemCpu = new SystemCpu()
  private aggregate = new DeviceAggregate()
  private lastTake: number | null = null
  private stopTimer: (() => void) | null = null
  private hangs = 0
  private gpuCrashes = 0
  private speedLimit: number | null = null
  private startupMs: number | null = null

  constructor(private readonly deps: SamplerDeps) {}

  noteHang(): void {
    this.hangs += 1
  }

  noteGpuCrash(): void {
    this.gpuCrashes += 1
  }

  noteSpeedLimit(limit: number): void {
    if (Number.isFinite(limit)) this.speedLimit = limit
  }

  markUsable(ms: number): void {
    this.startupMs ??= Math.round(ms)
  }

  /** O agregado desde a última take, e zera. A primeira (ou a depois de parado) liga o timer. */
  take(): DeviceTake {
    const now = this.deps.now()
    if (this.lastTake === null) this.start()
    const seconds = this.lastTake === null ? 0 : Math.round((now - this.lastTake) / 1000)
    this.lastTake = now
    return { seconds, ...this.events(), ...this.flush() }
  }

  private start(): void {
    this.read() // aquece a CPU cumulativa: a próxima leitura já tem diferença
    this.aggregate = new DeviceAggregate()
    this.stopTimer = this.deps.every(SAMPLE_MS, () => this.tick())
  }

  /** Sem take há 10 min: ninguém está levando o agregado, desliga até a próxima. */
  private tick(): void {
    if (this.lastTake !== null && this.deps.now() - this.lastTake >= IDLE_STOP_MS) {
      this.stopTimer?.()
      this.stopTimer = null
      this.lastTake = null
      return
    }
    this.read()
  }

  private events(): Pick<DeviceTake, 'hangs' | 'gpuCrashes' | 'gpuStatus' | 'startupMs'> {
    const events = {
      hangs: this.hangs,
      gpuCrashes: this.gpuCrashes,
      gpuStatus: this.deps.gpuStatus(),
      startupMs: this.startupMs
    }
    this.hangs = 0
    this.gpuCrashes = 0
    return events
  }

  private flush(): Pick<DeviceTake, 'cpu' | 'cpuAppMax' | 'mem' | 'helpers' | 'sys'> {
    const agg = this.aggregate.take()
    return {
      ...agg,
      sys: {
        ...agg.sys,
        memTotalMB: Math.round(this.deps.totalMem() / MB),
        speedLimitPct: this.speedLimit
      }
    }
  }

  /** Uma leitura; erro numa API do sistema perde só esta leitura. */
  private read(): void {
    try {
      this.aggregate.add(this.reading())
    } catch {
      // segue: a próxima leitura tenta de novo
    }
  }

  private reading(): DeviceReading {
    const { deps } = this
    const now = deps.now()
    const metrics = deps.appMetrics()
    const known = new Set(metrics.map((m) => m.pid))
    return {
      ...processReading(this.breakdown.sample(metrics, now, deps.cores)),
      helpers: deps.helpers?.sample(known, now, deps.cores) ?? { cpu: null, memMB: null },
      sysCpu: this.systemCpu.sample(deps.cpus()),
      memFreeMB: deps.freeMem() / MB,
      loadAvg: deps.loadAvg(),
      onBattery: deps.onBattery()
    }
  }
}
