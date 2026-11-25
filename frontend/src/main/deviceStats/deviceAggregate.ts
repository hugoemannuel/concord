import type { DeviceTake } from '../../shared/deviceStats'
import type { HelperStats } from './linuxHelpers'

// Agregado das leituras de 15 s desde a última take (temporalidade delta,
// docs/adr/0069): média, máximo ou mínimo, conforme a pergunta de cada sinal.

type Cpu = DeviceTake['cpu']

/** Uma leitura de 15 s (CPU em % da máquina; null = não medido nesta leitura). */
export interface DeviceReading {
  cpu: Cpu
  memAppMB: number | null
  memRendererMB: number | null
  memGpuMB: number | null
  helpers: HelperStats
  sysCpu: number | null
  memFreeMB: number | null
  loadAvg: number | null
  onBattery: boolean | null
}

export type AggregateTake = Pick<DeviceTake, 'cpu' | 'cpuAppMax' | 'mem' | 'helpers'> & {
  sys: Omit<DeviceTake['sys'], 'memTotalMB' | 'speedLimitPct'>
}

const round1 = (value: number | null): number | null =>
  value === null ? null : Math.round(value * 10) / 10
const round0 = (value: number | null): number | null => (value === null ? null : Math.round(value))

export class Stat {
  private sum = 0
  private count = 0
  private high = -Infinity
  private low = Infinity

  add(value: number | null): void {
    if (value === null || !Number.isFinite(value)) return
    this.sum += value
    this.count += 1
    this.high = Math.max(this.high, value)
    this.low = Math.min(this.low, value)
  }

  mean(): number | null {
    return this.count > 0 ? this.sum / this.count : null
  }

  max(): number | null {
    return this.count > 0 ? this.high : null
  }

  min(): number | null {
    return this.count > 0 ? this.low : null
  }
}

/** Soma dos tipos medidos; null se nenhum foi (a 1ª leitura só aquece a CPU cumulativa). */
function appCpu(cpu: Cpu): number | null {
  const values = [cpu.browser, cpu.renderer, cpu.gpu, cpu.other].filter((v) => v !== null)
  return values.length > 0 ? values.reduce((a, b) => a + b, 0) : null
}

const CPU_KEYS = ['browser', 'renderer', 'gpu', 'other'] as const
const STAT_NAMES = [
  ...CPU_KEYS,
  'app',
  'memApp',
  'memRenderer',
  'memGpu',
  'helperCpu',
  'helperMem',
  'sysCpu',
  'memFree',
  'load'
] as const
type StatName = (typeof STAT_NAMES)[number]

function freshStats(): Record<StatName, Stat> {
  return Object.fromEntries(STAT_NAMES.map((name) => [name, new Stat()])) as Record<StatName, Stat>
}

export class DeviceAggregate {
  private stats = freshStats()
  private battery: boolean | null = null

  add(reading: DeviceReading): void {
    const s = this.stats
    for (const key of CPU_KEYS) s[key].add(reading.cpu[key])
    s.app.add(appCpu(reading.cpu))
    s.memApp.add(reading.memAppMB)
    s.memRenderer.add(reading.memRendererMB)
    s.memGpu.add(reading.memGpuMB)
    s.helperCpu.add(reading.helpers.cpu)
    s.helperMem.add(reading.helpers.memMB)
    s.sysCpu.add(reading.sysCpu)
    s.memFree.add(reading.memFreeMB)
    s.load.add(reading.loadAvg)
    // Esteve na bateria em alguma leitura da janela.
    if (reading.onBattery !== null) this.battery = (this.battery ?? false) || reading.onBattery
  }

  /** O agregado desde a última take, e zera. */
  take(): AggregateTake {
    const s = this.stats
    const result: AggregateTake = {
      cpu: {
        browser: round1(s.browser.mean()),
        renderer: round1(s.renderer.mean()),
        gpu: round1(s.gpu.mean()),
        other: round1(s.other.mean())
      },
      cpuAppMax: round1(s.app.max()),
      mem: {
        appMB: round0(s.memApp.mean()),
        rendererMB: round0(s.memRenderer.max()),
        gpuMB: round0(s.memGpu.max())
      },
      helpers: { cpu: round1(s.helperCpu.mean()), memMB: round0(s.helperMem.mean()) },
      sys: {
        cpuPct: round1(s.sysCpu.mean()),
        memFreeMinMB: round0(s.memFree.min()),
        loadAvg: round1(s.load.mean()),
        onBattery: this.battery
      }
    }
    this.stats = freshStats()
    this.battery = null
    return result
  }
}
