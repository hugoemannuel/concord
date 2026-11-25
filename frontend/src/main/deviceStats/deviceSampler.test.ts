import { describe, expect, it, vi } from 'vitest'
import type { ProcessMetric } from 'electron'
import {
  DeviceSampler,
  IDLE_STOP_MS,
  processReading,
  SAMPLE_MS,
  type SamplerDeps
} from './deviceSampler'

function metric(pid: number, type: string, cpu: number, memKB: number): ProcessMetric {
  return {
    pid,
    type,
    creationTime: 0,
    cpu: { cumulativeCPUUsage: cpu },
    memory: { workingSetSize: memKB }
  } as unknown as ProcessMetric
}

const core = (busy: number, idle: number) => ({
  times: { user: busy, nice: 0, sys: 0, idle, irq: 0 }
})

function fakeDeps(over: Partial<SamplerDeps> = {}) {
  let now = 0
  let tick: (() => void) | null = null
  let cpuSeconds = 0
  let busy = 0
  const stop = vi.fn(() => {
    tick = null
  })
  const every = vi.fn((_ms: number, fn: () => void) => {
    tick = fn
    return stop
  })
  const deps: SamplerDeps = {
    appMetrics: () => [
      metric(1, 'Browser', cpuSeconds, 100 * 1024),
      metric(2, 'Tab', cpuSeconds * 2, 300 * 1024),
      metric(3, 'GPU', 0, 50 * 1024),
      metric(4, 'Utility', 0, 10 * 1024)
    ],
    cpus: () => [core(busy, 100 - busy + now / 10)],
    freeMem: () => 2048 * 1024 * 1024,
    totalMem: () => 8192 * 1024 * 1024,
    loadAvg: () => 0.5,
    onBattery: () => false,
    helpers: null,
    gpuStatus: () => 'enabled',
    now: () => now,
    every,
    cores: 1,
    ...over
  }
  return {
    deps,
    every,
    stop,
    advance(ms: number, cpu = 0, sysBusy = 0) {
      now += ms
      cpuSeconds += cpu
      busy += sysBusy
      tick?.()
    }
  }
}

describe('processReading', () => {
  it('Browser→browser, Tab→renderer, GPU→gpu, Utility+Other→other', () => {
    const reading = processReading({
      Browser: { cpu: 1, memMB: 100 },
      Tab: { cpu: 5, memMB: 400 },
      GPU: { cpu: 2, memMB: 150 },
      Utility: { cpu: 0.5, memMB: 30 },
      Other: { cpu: 0.25, memMB: 20 }
    })
    expect(reading).toEqual({
      cpu: { browser: 1, renderer: 5, gpu: 2, other: 0.75 },
      memAppMB: 700,
      memRendererMB: 400,
      memGpuMB: 150
    })
  })

  it('tipo ausente ou ainda aquecendo: null', () => {
    expect(processReading({ Utility: { cpu: null, memMB: 10 } })).toEqual({
      cpu: { browser: null, renderer: null, gpu: null, other: null },
      memAppMB: 10,
      memRendererMB: null,
      memGpuMB: null
    })
    expect(processReading({}).memAppMB).toBeNull()
  })
})

describe('DeviceSampler', () => {
  it('não liga nada antes da primeira take', () => {
    const { deps, every } = fakeDeps()
    new DeviceSampler(deps)
    expect(every).not.toHaveBeenCalled()
  })

  it('a primeira take liga o timer de 15 s e volta vazia', () => {
    const { deps, every } = fakeDeps()
    const sampler = new DeviceSampler(deps)
    const first = sampler.take()
    expect(every).toHaveBeenCalledWith(SAMPLE_MS, expect.any(Function))
    expect(first.seconds).toBe(0)
    expect(first.cpu.renderer).toBeNull()
    expect(first.sys.memTotalMB).toBe(8192)
    sampler.take()
    expect(every).toHaveBeenCalledTimes(1)
  })

  it('agrega as leituras desde a última take', () => {
    const { deps, advance } = fakeDeps()
    const sampler = new DeviceSampler(deps)
    sampler.take()
    // 1,5 s de CPU do browser e 3 s do renderer em 15 s, máquina de 1 núcleo.
    advance(15_000, 1.5, 30)
    advance(15_000, 1.5, 30)
    const take = sampler.take()
    expect(take.seconds).toBe(30)
    expect(take.cpu).toEqual({ browser: 10, renderer: 20, gpu: 0, other: 0 })
    expect(take.cpuAppMax).toBe(30)
    expect(take.mem).toEqual({ appMB: 460, rendererMB: 300, gpuMB: 50 })
    expect(take.sys).toEqual({
      cpuPct: expect.any(Number),
      memFreeMinMB: 2048,
      memTotalMB: 8192,
      loadAvg: 0.5,
      onBattery: false,
      speedLimitPct: null
    })
    expect(take.gpuStatus).toBe('enabled')
    expect(take.helpers).toEqual({ cpu: null, memMB: null })
  })

  it('eventos: travadas e GPU somam e zeram; limite de velocidade fica', () => {
    const { deps } = fakeDeps()
    const sampler = new DeviceSampler(deps)
    sampler.noteHang()
    sampler.noteHang()
    sampler.noteGpuCrash()
    sampler.noteSpeedLimit(70)
    const take = sampler.take()
    expect([take.hangs, take.gpuCrashes, take.sys.speedLimitPct]).toEqual([2, 1, 70])
    const next = sampler.take()
    expect([next.hangs, next.gpuCrashes, next.sys.speedLimitPct]).toEqual([0, 0, 70])
  })

  it('abertura: marca uma vez só', () => {
    const { deps } = fakeDeps()
    const sampler = new DeviceSampler(deps)
    expect(sampler.take().startupMs).toBeNull()
    sampler.markUsable(4200.4)
    sampler.markUsable(9000)
    expect(sampler.take().startupMs).toBe(4200)
  })

  it('helpers do Linux entram com os PIDs do getAppMetrics de fora', () => {
    const sample = vi.fn(() => ({ cpu: 1, memMB: 20 }))
    const { deps, advance } = fakeDeps({ helpers: { sample } as never })
    const sampler = new DeviceSampler(deps)
    sampler.take()
    advance(15_000)
    expect(sample).toHaveBeenLastCalledWith(new Set([1, 2, 3, 4]), 15_000, 1)
    expect(sampler.take().helpers).toEqual({ cpu: 1, memMB: 20 })
  })

  it('leitura que falha não derruba o timer', () => {
    const { deps, advance } = fakeDeps({
      appMetrics: () => {
        throw new Error('x')
      }
    })
    const sampler = new DeviceSampler(deps)
    sampler.take()
    expect(() => advance(15_000)).not.toThrow()
    expect(sampler.take().mem.appMB).toBeNull()
  })
})

describe('DeviceSampler parado sem take', () => {
  const minutes = (sampler: { advance(ms: number): void }, n: number) => {
    for (let i = 0; i < (n * 60_000) / SAMPLE_MS; i++) sampler.advance(SAMPLE_MS)
  }

  it('10 min sem take desliga o timer; a próxima take religa e volta vazia', () => {
    const fake = fakeDeps()
    const sampler = new DeviceSampler(fake.deps)
    sampler.take()
    minutes(fake, 9)
    expect(fake.stop).not.toHaveBeenCalled()
    minutes(fake, 1)
    expect(fake.stop).toHaveBeenCalledTimes(1)
    const back = sampler.take()
    expect(back.seconds).toBe(0)
    expect(back.cpu.renderer).toBeNull()
    expect(fake.every).toHaveBeenCalledTimes(2)
    fake.advance(SAMPLE_MS, 1.5)
    fake.advance(SAMPLE_MS, 1.5)
    expect(sampler.take().seconds).toBe(30)
  })

  it('take antes dos 10 min mantém o timer ligado', () => {
    const fake = fakeDeps()
    const sampler = new DeviceSampler(fake.deps)
    sampler.take()
    minutes(fake, 6)
    sampler.take()
    minutes(fake, 6)
    expect(fake.stop).not.toHaveBeenCalled()
    expect(IDLE_STOP_MS).toBe(10 * 60_000)
  })
})
