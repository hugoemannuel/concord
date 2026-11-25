import { describe, expect, it, vi } from 'vitest'
import type { DeviceTake } from '../../../../../../shared/deviceStats'
import type { ClientContext } from '../telemetryTypes'
import { DeviceReporter, type ReporterDeps } from './deviceReporter'
import type { DeviceBatch, DeviceLabel, RendererMeasures } from './deviceTypes'

const MIN = 60_000

const ctx: ClientContext = {
  os: 'Windows',
  app_version: '1.40.0',
  target: 'desktop',
  gpu: 'ANGLE (NVIDIA)',
  network: 'wifi',
  cores: 8
}

const measures = { long_count: 0, api_count: 0 } as RendererMeasures

function mainTake(over: Partial<DeviceTake> = {}): DeviceTake {
  return {
    seconds: 60,
    cpu: { browser: 1, renderer: 5, gpu: 2, other: 0 },
    cpuAppMax: 9,
    mem: { appMB: 800, rendererMB: 400, gpuMB: 100 },
    helpers: { cpu: null, memMB: null },
    sys: {
      cpuPct: 30,
      memFreeMinMB: 2000,
      memTotalMB: 16000,
      loadAvg: null,
      onBattery: false,
      speedLimitPct: null
    },
    hangs: 0,
    gpuCrashes: 0,
    gpuStatus: 'software',
    startupMs: null,
    ...over
  }
}

function setup(over: Partial<ReporterDeps> = {}) {
  let now = 0
  let label: DeviceLabel = { state: 'parado', watching: false, game: null }
  const sent: DeviceBatch[] = []
  const deps: ReporterDeps = {
    now: () => now,
    label: () => label,
    measures: vi.fn(() => measures),
    takeMain: vi.fn(async () => mainTake()),
    context: vi.fn(async () => ctx),
    send: vi.fn(async (batch: DeviceBatch) => {
      sent.push(batch)
    }),
    sessionId: 's1',
    web: false,
    webStartupMs: () => null,
    ...over
  }
  const reporter = new DeviceReporter(deps)
  return {
    reporter,
    deps,
    sent,
    at: (ms: number) => {
      now = ms
    },
    setLabel: (next: Partial<DeviceLabel>) => {
      label = { ...label, ...next }
    }
  }
}

describe('DeviceReporter', () => {
  it('arm liga o amostrador do main e descarta a primeira take', async () => {
    const { reporter, deps } = setup()
    await reporter.arm()
    expect(deps.takeMain).toHaveBeenCalledTimes(1)
  })

  it('parado: fecha a linha a cada 5 min (o timer de 60 s só confere)', async () => {
    const { reporter, deps, at } = setup()
    for (let i = 1; i <= 4; i++) {
      at(i * MIN)
      await reporter.tick()
    }
    expect(deps.measures).not.toHaveBeenCalled()
    at(5 * MIN - 1000) // timer adiantado: tolerância
    await reporter.tick()
    expect(deps.measures).toHaveBeenCalledTimes(1)
  })

  it('em call: 1 linha por minuto; o lote sai com 5', async () => {
    const { reporter, sent, at, setLabel } = setup()
    setLabel({ state: 'call' })
    await reporter.labelChanged() // menos de 5 s: só troca o rótulo
    for (let i = 1; i <= 5; i++) {
      at(i * MIN)
      await reporter.tick()
    }
    expect(sent).toHaveLength(1)
    const [batch] = sent
    expect(batch.samples).toHaveLength(5)
    expect(batch.samples[0]).toMatchObject({
      seconds: 60,
      ago_s: 240,
      state: 'call',
      cpu_renderer: 5,
      mem_app_mb: 800
    })
    expect(batch.session).toEqual({
      id: 's1',
      os: 'Windows',
      app_version: '1.40.0',
      target: 'desktop',
      gpu: 'ANGLE (NVIDIA)',
      cores: 8,
      mem_total_mb: 16000,
      startup_ms: null,
      gpu_status: 'software'
    })
  })

  it('mudou o estado: fecha a linha com o rótulo antigo; saiu da call manda o lote', async () => {
    const { reporter, sent, at, setLabel } = setup()
    setLabel({ state: 'call' })
    at(1000)
    await reporter.labelChanged()
    at(30_000)
    setLabel({ watching: true })
    await reporter.labelChanged()
    at(50_000)
    setLabel({ state: 'parado', watching: false })
    await reporter.labelChanged()
    expect(sent).toHaveLength(1)
    expect(sent[0].samples.map((s) => [s.state, s.watching, s.seconds])).toEqual([
      ['call', false, 30],
      ['call', true, 20]
    ])
  })

  it('mesmo rótulo não fecha nada', async () => {
    const { reporter, deps, at } = setup()
    at(30_000)
    await reporter.labelChanged()
    expect(deps.measures).not.toHaveBeenCalled()
  })

  it('abertura: startupMs do main; no web, o medido no renderer', async () => {
    const desktop = setup({ takeMain: async () => mainTake({ startupMs: 4200 }) })
    desktop.setLabel({ state: 'call' })
    await desktop.reporter.labelChanged()
    desktop.at(10_000)
    desktop.setLabel({ state: 'parado' })
    await desktop.reporter.labelChanged()
    expect(desktop.sent[0].session.startup_ms).toBe(4200)

    const web = setup({
      web: true,
      takeMain: async () => null,
      webStartupMs: () => 2500,
      context: async () => ({ ...ctx, target: 'web', gpu: 'llvmpipe (LLVM)' })
    })
    web.setLabel({ state: 'call' })
    await web.reporter.labelChanged()
    web.at(10_000)
    web.setLabel({ state: 'parado' })
    await web.reporter.labelChanged()
    expect(web.sent[0].session).toMatchObject({
      startup_ms: 2500,
      gpu_status: 'software',
      mem_total_mb: null
    })
    expect(web.sent[0].samples[0]).toMatchObject({ cpu_renderer: null, hangs: 0 })
  })

  it('take do main que falha vira linha sem os campos do main', async () => {
    const { reporter, sent, at, setLabel } = setup({
      takeMain: vi.fn(async () => {
        throw new Error('ipc')
      })
    })
    setLabel({ state: 'call' })
    await reporter.labelChanged()
    at(10_000)
    setLabel({ state: 'parado' })
    await reporter.labelChanged()
    expect(sent[0].samples[0].cpu_renderer).toBeNull()
    expect(sent[0].session.gpu_status).toBe('')
  })

  it('falha de envio descarta o lote (é só telemetria)', async () => {
    const send = vi.fn(async () => {
      throw new Error('500')
    })
    const { reporter, at, setLabel } = setup({ send })
    setLabel({ state: 'call' })
    await reporter.labelChanged()
    at(10_000)
    setLabel({ state: 'parado' })
    await expect(reporter.labelChanged()).resolves.toBeUndefined()
    at(200_000)
    await reporter.tick()
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('depois do stop não manda nada', async () => {
    const { reporter, deps, at, setLabel } = setup()
    reporter.stop()
    setLabel({ state: 'call' })
    at(10_000)
    await reporter.labelChanged()
    at(20_000)
    setLabel({ state: 'parado' })
    await reporter.labelChanged()
    expect(deps.send).not.toHaveBeenCalled()
  })
})
