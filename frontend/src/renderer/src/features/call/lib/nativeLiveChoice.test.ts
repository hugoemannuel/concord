import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  loadNativeLivePref,
  nativeLiveToggleValue,
  nativeLiveWanted,
  nativeQuality,
  nativeStatsReport,
  saveNativeLivePref,
  stampNativeStats
} from './nativeLiveChoice'

const NVIDIA = { available: true, nvidia: true }
const AMD = { available: true, nvidia: false }
const MISSING = { available: false, nvidia: false }

describe('nativeLiveWanted', () => {
  it('automático: só liga com NVIDIA (o Chromium codificaria no processador)', () => {
    expect(nativeLiveWanted(null, NVIDIA, false)).toBe(true)
    expect(nativeLiveWanted(null, AMD, false)).toBe(false)
  })

  it('a escolha da pessoa vale nos dois sentidos', () => {
    expect(nativeLiveWanted(true, AMD, false)).toBe(true)
    expect(nativeLiveWanted(false, NVIDIA, false)).toBe(false)
  })

  it('sem helper, sem resposta do main ou depois de uma falha: Chromium', () => {
    expect(nativeLiveWanted(true, MISSING, false)).toBe(false)
    expect(nativeLiveWanted(true, null, false)).toBe(false)
    expect(nativeLiveWanted(true, NVIDIA, true)).toBe(false)
  })

  it('o interruptor mostra o automático até a pessoa escolher', () => {
    expect(nativeLiveToggleValue(null, NVIDIA)).toBe(true)
    expect(nativeLiveToggleValue(null, AMD)).toBe(false)
    expect(nativeLiveToggleValue(true, AMD)).toBe(true)
  })
})

describe('preferência', () => {
  beforeEach(() => {
    const data = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value)
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('começa no automático e guarda a escolha', () => {
    expect(loadNativeLivePref()).toBeNull()
    saveNativeLivePref(true)
    expect(loadNativeLivePref()).toBe(true)
    saveNativeLivePref(false)
    expect(loadNativeLivePref()).toBe(false)
  })
})

describe('nativeQuality', () => {
  it('antes do seletor: a caixa e o bitrate do preset', () => {
    expect(nativeQuality({ resolution: '1080p', frameRate: 60 })).toEqual({
      width: 1920,
      height: 1080,
      fps: 60,
      maxBitrate: 7_000_000
    })
    expect(nativeQuality({ resolution: '720p', frameRate: 30 })).toEqual({
      width: 1280,
      height: 720,
      fps: 30,
      maxBitrate: 3_000_000
    })
  })

  it('com a fonte: cabe nela sem ampliar', () => {
    expect(nativeQuality({ resolution: 'source', frameRate: 30 }, { width: 1920, height: 1200 })).toMatchObject({
      width: 1920,
      height: 1200
    })
  })
})

describe('nativeStatsReport', () => {
  it('indexa pelo id, como o getStats()', () => {
    const report = nativeStatsReport([{ id: 'OT1', type: 'outbound-rtp' }, { type: 'codec' }])
    expect(report.get('OT1')).toEqual({ id: 'OT1', type: 'outbound-rtp' })
    expect(report.size).toBe(2)
  })
})

describe('stampNativeStats', () => {
  it('regressão: o helper manda o tempo do libwebrtc em µs; vale a hora de chegada, em ms', () => {
    const stats = stampNativeStats([{ id: 'OT1', timestamp: 1_764_000_000_000_000 }], 1_764_000_000_000)
    expect(stats[0]).toEqual({ id: 'OT1', timestamp: 1_764_000_000_000 })
  })

  it('continua certo se o helper passar a mandar ms (ou não mandar o tempo)', () => {
    const stats = stampNativeStats([{ id: 'a', timestamp: 1_764_000_000_000 }, { id: 'b' }], 5000)
    expect(stats.map((stat) => stat.timestamp)).toEqual([5000, 5000])
  })
})
