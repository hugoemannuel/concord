import { describe, expect, it } from 'vitest'
import { mustUpdate, requiredUpdateStatus } from './requiredUpdate'

describe('mustUpdate', () => {
  it('versão instalada abaixo da mínima precisa atualizar', () => {
    expect(mustUpdate('0.9.9', '0.10.0')).toBe(true)
  })

  it('na mínima ou acima, não', () => {
    expect(mustUpdate('0.10.0', '0.10.0')).toBe(false)
    expect(mustUpdate('0.10.1', '0.10.0')).toBe(false)
  })

  it('sem versão mínima, ou na web (sem versão instalada), não bloqueia', () => {
    expect(mustUpdate('0.9.9', null)).toBe(false)
    expect(mustUpdate('0.9.9', '')).toBe(false)
    expect(mustUpdate(null, '0.10.0')).toBe(false)
  })
})

describe('requiredUpdateStatus', () => {
  const idle = { requested: false, version: null, ready: false, progress: 0 }

  it('antes do clique: parado', () => {
    expect(requiredUpdateStatus(idle)).toBe('idle')
  })

  it('clicou sem versão nova conhecida: procurando', () => {
    expect(requiredUpdateStatus({ ...idle, requested: true })).toBe('searching')
  })

  it('clicou com versão conhecida: baixando, e reiniciando quando termina', () => {
    expect(requiredUpdateStatus({ ...idle, requested: true, version: '2.0.0', progress: 40 })).toBe(
      'downloading'
    )
    expect(
      requiredUpdateStatus({ ...idle, requested: true, version: '2.0.0', progress: 100 })
    ).toBe('restarting')
    expect(requiredUpdateStatus({ ...idle, requested: true, version: '2.0.0', ready: true })).toBe(
      'restarting'
    )
  })
})
