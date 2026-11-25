import type { DeviceTake } from '../../../../../../shared/deviceStats'
import type { MainMeasures } from './deviceTypes'

const EMPTY: MainMeasures = {
  cpu_browser: null,
  cpu_renderer: null,
  cpu_gpu: null,
  cpu_other: null,
  cpu_app_max: null,
  mem_app_mb: null,
  mem_renderer_mb: null,
  mem_gpu_mb: null,
  cpu_helpers: null,
  mem_helpers_mb: null,
  sys_cpu_pct: null,
  sys_mem_free_mb: null,
  load_avg: null,
  on_battery: null,
  speed_limit_pct: null,
  hangs: 0,
  gpu_crashes: 0
}

/** A take do processo principal nos campos do contrato; null (web) = não medido. */
export function mainMeasuresOf(take: DeviceTake | null): MainMeasures {
  if (!take) return EMPTY
  const { cpu, mem, helpers, sys } = take
  return {
    cpu_browser: cpu.browser,
    cpu_renderer: cpu.renderer,
    cpu_gpu: cpu.gpu,
    cpu_other: cpu.other,
    cpu_app_max: take.cpuAppMax,
    mem_app_mb: mem.appMB,
    mem_renderer_mb: mem.rendererMB,
    mem_gpu_mb: mem.gpuMB,
    cpu_helpers: helpers.cpu,
    mem_helpers_mb: helpers.memMB,
    sys_cpu_pct: sys.cpuPct,
    sys_mem_free_mb: sys.memFreeMinMB,
    load_avg: sys.loadAvg,
    on_battery: sys.onBattery,
    speed_limit_pct: sys.speedLimitPct,
    hangs: take.hangs,
    gpu_crashes: take.gpuCrashes
  }
}
