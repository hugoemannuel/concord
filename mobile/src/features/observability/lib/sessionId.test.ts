import { newSessionId } from './sessionId'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('newSessionId', () => {
  it('UUID v4 (o backend recusa outra coisa), mesmo sem crypto.randomUUID no Hermes', () => {
    expect(newSessionId(() => 0)).toMatch(UUID)
    expect(newSessionId(() => 0.999999)).toMatch(UUID)
    expect(newSessionId()).toMatch(UUID)
  })

  it('ids diferentes a cada sessão', () => {
    expect(newSessionId()).not.toBe(newSessionId())
  })
})
