import { describe, expect, it } from 'vitest'
import { vi } from 'vitest'
import { PENDING_TTL_MS, pendingVerdict, settlePending } from './pendingServerRequest'

const pending = { serverId: 's2', at: 1000 }

describe('pendingVerdict', () => {
  it('roda quando o servidor pedido abriu e terminou de carregar', () => {
    expect(pendingVerdict(pending, { serverId: 's2', loading: false }, 1500)).toBe('run')
  })

  it('espera enquanto o aberto é outro ou ainda carrega', () => {
    expect(pendingVerdict(pending, { serverId: 's1', loading: false }, 1500)).toBe('wait')
    expect(pendingVerdict(pending, { serverId: 's2', loading: true }, 1500)).toBe('wait')
    expect(pendingVerdict(pending, { serverId: undefined, loading: false }, 1500)).toBe('wait')
  })

  it('descarta o pedido velho, mesmo com o servidor aberto', () => {
    const late = 1000 + PENDING_TTL_MS + 1
    expect(pendingVerdict(pending, { serverId: 's2', loading: false }, late)).toBe('drop')
  })
})

describe('settlePending', () => {
  const run = vi.fn()
  const req = { ...pending, run }

  it('sem pedido, nada a fazer', () => {
    const clear = vi.fn()
    expect(settlePending(null, { serverId: 's2', loading: false }, 1500, clear)).toBeNull()
    expect(clear).not.toHaveBeenCalled()
  })

  it('esperando: não limpa nem roda', () => {
    const clear = vi.fn()
    expect(settlePending(req, { serverId: 's1', loading: false }, 1500, clear)).toBeNull()
    expect(clear).not.toHaveBeenCalled()
  })

  it('pronto: limpa a fila e devolve a ação', () => {
    const clear = vi.fn()
    expect(settlePending(req, { serverId: 's2', loading: false }, 1500, clear)).toBe(run)
    expect(clear).toHaveBeenCalledOnce()
  })

  it('velho: limpa a fila e não roda', () => {
    const clear = vi.fn()
    const late = 1000 + PENDING_TTL_MS + 1
    expect(settlePending(req, { serverId: 's2', loading: false }, late, clear)).toBeNull()
    expect(clear).toHaveBeenCalledOnce()
  })
})
