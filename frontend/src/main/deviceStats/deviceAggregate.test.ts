import { describe, expect, it } from 'vitest'
import { DeviceAggregate, Stat, type DeviceReading } from './deviceAggregate'

function reading(over: Partial<DeviceReading> = {}): DeviceReading {
  return {
    cpu: { browser: 1, renderer: 4, gpu: 2, other: 1 },
    memAppMB: 800,
    memRendererMB: 400,
    memGpuMB: 200,
    helpers: { cpu: null, memMB: null },
    sysCpu: 30,
    memFreeMB: 2000,
    loadAvg: null,
    onBattery: false,
    ...over
  }
}

describe('Stat', () => {
  it('ignora null e o que não é número finito', () => {
    const stat = new Stat()
    ;[2, null, 4, Number.NaN, 6].forEach((v) => stat.add(v))
    expect([stat.mean(), stat.max(), stat.min()]).toEqual([4, 6, 2])
  })

  it('vazio: tudo null', () => {
    const stat = new Stat()
    expect([stat.mean(), stat.max(), stat.min()]).toEqual([null, null, null])
  })
})

describe('DeviceAggregate', () => {
  it('médias da CPU por tipo, máximo do app, memória média/máx, livre mínima', () => {
    const agg = new DeviceAggregate()
    agg.add(reading())
    agg.add(
      reading({
        cpu: { browser: 3, renderer: 8, gpu: 2, other: 3 },
        memAppMB: 1000,
        memRendererMB: 500,
        memGpuMB: 150,
        sysCpu: 50,
        memFreeMB: 1500,
        onBattery: true
      })
    )
    expect(agg.take()).toEqual({
      cpu: { browser: 2, renderer: 6, gpu: 2, other: 2 },
      cpuAppMax: 16,
      mem: { appMB: 900, rendererMB: 500, gpuMB: 200 },
      helpers: { cpu: null, memMB: null },
      sys: { cpuPct: 40, memFreeMinMB: 1500, loadAvg: null, onBattery: true }
    })
  })

  it('take zera: a próxima começa vazia', () => {
    const agg = new DeviceAggregate()
    agg.add(reading({ helpers: { cpu: 1.26, memMB: 30.4 }, loadAvg: 1.5 }))
    const first = agg.take()
    expect(first.helpers).toEqual({ cpu: 1.3, memMB: 30 })
    expect(first.sys.loadAvg).toBe(1.5)
    expect(agg.take()).toEqual({
      cpu: { browser: null, renderer: null, gpu: null, other: null },
      cpuAppMax: null,
      mem: { appMB: null, rendererMB: null, gpuMB: null },
      helpers: { cpu: null, memMB: null },
      sys: { cpuPct: null, memFreeMinMB: null, loadAvg: null, onBattery: null }
    })
  })

  it('CPU do app só com algum tipo medido (a 1ª leitura só aquece)', () => {
    const agg = new DeviceAggregate()
    agg.add(reading({ cpu: { browser: null, renderer: null, gpu: null, other: null } }))
    agg.add(reading({ cpu: { browser: 1, renderer: null, gpu: null, other: null } }))
    expect(agg.take().cpuAppMax).toBe(1)
  })

  it('bateria: true se esteve na bateria em alguma leitura', () => {
    const agg = new DeviceAggregate()
    agg.add(reading({ onBattery: null }))
    expect(agg.take().sys.onBattery).toBeNull()
    agg.add(reading({ onBattery: false }))
    expect(agg.take().sys.onBattery).toBe(false)
  })
})
