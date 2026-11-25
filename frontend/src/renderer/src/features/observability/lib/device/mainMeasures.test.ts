import { describe, expect, it } from 'vitest'
import type { DeviceTake } from '../../../../../../shared/deviceStats'
import { mainMeasuresOf } from './mainMeasures'

const take: DeviceTake = {
  seconds: 60,
  cpu: { browser: 1.2, renderer: 6.5, gpu: 2, other: 0.4 },
  cpuAppMax: 14,
  mem: { appMB: 820, rendererMB: 410, gpuMB: 190 },
  helpers: { cpu: 0.5, memMB: 40 },
  sys: {
    cpuPct: 35,
    memFreeMinMB: 2100,
    memTotalMB: 16000,
    loadAvg: 1.2,
    onBattery: false,
    speedLimitPct: 80
  },
  hangs: 1,
  gpuCrashes: 2,
  gpuStatus: 'enabled',
  startupMs: 4200
}

describe('mainMeasuresOf', () => {
  it('a take do main nos campos do contrato', () => {
    expect(mainMeasuresOf(take)).toEqual({
      cpu_browser: 1.2,
      cpu_renderer: 6.5,
      cpu_gpu: 2,
      cpu_other: 0.4,
      cpu_app_max: 14,
      mem_app_mb: 820,
      mem_renderer_mb: 410,
      mem_gpu_mb: 190,
      cpu_helpers: 0.5,
      mem_helpers_mb: 40,
      sys_cpu_pct: 35,
      sys_mem_free_mb: 2100,
      load_avg: 1.2,
      on_battery: false,
      speed_limit_pct: 80,
      hangs: 1,
      gpu_crashes: 2
    })
  })

  it('sem main (web ou IPC falhou): tudo null e contadores 0', () => {
    const empty = mainMeasuresOf(null)
    expect(empty.cpu_renderer).toBeNull()
    expect(empty.on_battery).toBeNull()
    expect([empty.hangs, empty.gpu_crashes]).toEqual([0, 0])
  })
})
