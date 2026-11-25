import { beforeEach, describe, expect, it } from 'vitest'
import { noteWsPong, takeWsRtt } from './wsRtt'

beforeEach(() => {
  takeWsRtt()
})

describe('wsRtt', () => {
  it('pong sem ping (nenhum nesta conexão) não conta', () => {
    noteWsPong(null, 1000)
    expect(takeWsRtt()).toEqual({ medianMs: null, maxMs: null })
  })

  it('mediana e máximo desde a última take, e zera', () => {
    noteWsPong(1000, 1040)
    noteWsPong(2000, 2090)
    noteWsPong(3000, 3050)
    expect(takeWsRtt()).toEqual({ medianMs: 50, maxMs: 90 })
    expect(takeWsRtt()).toEqual({ medianMs: null, maxMs: null })
  })

  it('relógio que voltou (negativo) é ignorado', () => {
    noteWsPong(5000, 4000)
    expect(takeWsRtt().maxMs).toBeNull()
  })

  it('guarda no máximo as últimas 200 medidas', () => {
    for (let i = 0; i < 250; i++) noteWsPong(0, i < 50 ? 10_000 : 10)
    expect(takeWsRtt().maxMs).toBe(10)
  })
})
