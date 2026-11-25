import { describe, expect, it } from 'vitest'
import { LongFrameStats } from './longFrameStats'

describe('LongFrameStats', () => {
  it('conta só com a janela visível: quantos, ms somados, o maior', () => {
    const stats = new LongFrameStats()
    stats.add(120, true)
    stats.add(300.4, true)
    stats.add(900, false)
    expect(stats.take()).toEqual({ count: 2, ms: 420, maxMs: 300 })
  })

  it('take zera; sem quadro longo o maior fica null', () => {
    const stats = new LongFrameStats()
    stats.add(80, true)
    stats.take()
    expect(stats.take()).toEqual({ count: 0, ms: 0, maxMs: null })
  })
})
