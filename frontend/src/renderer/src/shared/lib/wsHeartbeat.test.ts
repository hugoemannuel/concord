import { describe, expect, it } from 'vitest'
import { heartbeatStep, PONG_TIMEOUT_MS } from './wsHeartbeat'

describe('heartbeatStep', () => {
  it('sem ping pendente: manda ping', () => {
    expect(heartbeatStep({ pingSentAt: null, lastMessageAt: 0, pongSeen: false }, 1000)).toBe(
      'ping'
    )
  })

  it('chegou algo depois do ping: a conexão está viva, manda outro', () => {
    expect(heartbeatStep({ pingSentAt: 1000, lastMessageAt: 1200, pongSeen: true }, 30_000)).toBe(
      'ping'
    )
  })

  it('nada desde o ping, dentro do prazo: espera', () => {
    const now = 1000 + PONG_TIMEOUT_MS - 1
    expect(heartbeatStep({ pingSentAt: 1000, lastMessageAt: 500, pongSeen: true }, now)).toBe(
      'wait'
    )
  })

  it('nada desde o ping, passou do prazo: conexão morta', () => {
    const now = 1000 + PONG_TIMEOUT_MS
    expect(heartbeatStep({ pingSentAt: 1000, lastMessageAt: 500, pongSeen: true }, now)).toBe(
      'dead'
    )
  })

  it('servidor antigo (nunca respondeu pong): nunca conta como morta', () => {
    expect(heartbeatStep({ pingSentAt: 1000, lastMessageAt: 500, pongSeen: false }, 600_000)).toBe(
      'ping'
    )
  })
})
