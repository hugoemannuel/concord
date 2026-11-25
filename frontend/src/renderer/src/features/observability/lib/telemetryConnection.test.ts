import { describe, expect, it } from 'vitest'
import type { CallConnection } from '../../call/lib/callConnection'
import { changeCallId, connectionChange, createConnectionLog } from './telemetryConnection'

const at = (
  phase: CallConnection['phase'],
  since: number,
  extra: Partial<CallConnection> = {}
): CallConnection => ({ phase, step: null, since, error: null, ...extra })

describe('connectionChange', () => {
  it('entrou: o tempo desde o começo da entrada', () => {
    expect(
      connectionChange(at('connecting', 1000, { step: 'media' }), at('connected', 2850))
    ).toEqual({ connectMs: 1850 })
  })

  it('caiu e voltou: evento com quanto tempo ficou fora', () => {
    expect(connectionChange(at('reconnecting', 10_000), at('connected', 13_200))).toEqual({
      event: { type: 'reconectou', detail: '3,2 s' }
    })
  })

  it('não conectou: em que etapa e o motivo', () => {
    const failed = at('failed', 5000, { error: 'UDP bloqueado?' })
    expect(connectionChange(at('connecting', 0, { step: 'media' }), failed)).toEqual({
      event: { type: 'conexao_falhou', detail: 'entrando (mídia): UDP bloqueado?' }
    })
    expect(connectionChange(at('reconnecting', 0), failed).event?.detail).toBe(
      'reconectando: UDP bloqueado?'
    )
  })

  it('o resto não conta', () => {
    expect(connectionChange(at('idle', 0), at('connecting', 1))).toEqual({})
    expect(connectionChange(at('connected', 0), at('reconnecting', 1))).toEqual({})
    expect(connectionChange(at('failed', 0), at('failed', 1))).toEqual({})
  })
})

describe('createConnectionLog', () => {
  it('guarda até alguém levar; o tempo para conectar é o último', () => {
    const log = createConnectionLog(() => 0)
    log.observe(at('connecting', 0, { step: 'signal' }), at('connected', 900), 'c1')
    log.observe(at('connected', 900), at('reconnecting', 5000), 'c1')
    log.observe(at('reconnecting', 5000), at('connected', 6000), 'c1')
    expect(log.take('c1')).toEqual({
      connectMs: 900,
      events: [{ type: 'reconectou', detail: '1 s', at: 0 }]
    })
    expect(log.take('c1')).toEqual({ connectMs: null, events: [] })
  })

  it('evento velho (de outra call) é descartado; no máximo 5', () => {
    let now = 0
    const log = createConnectionLog(() => now)
    const fail = (): void =>
      log.observe(at('connecting', 0, { step: 'token' }), at('failed', 1, { error: 'x' }))
    fail()
    now = 6 * 60_000
    for (let i = 0; i < 7; i++) fail()
    const { events } = log.take('')
    expect(events).toHaveLength(5)
    expect(events[0].detail).toBe('entrando (acesso): x')
  })

  it('takeEvents leva só os eventos: o tempo para entrar fica para a amostra', () => {
    const log = createConnectionLog(() => 0)
    log.observe(at('reconnecting', 0), at('failed', 1, { error: 'x' }), 'c1')
    log.observe(at('connecting', 2), at('connected', 902), 'c1')
    expect(log.takeEvents('c1').map((e) => e.type)).toEqual(['conexao_falhou'])
    expect(log.take('c1')).toEqual({ connectMs: 900, events: [] })
  })

  it('cada call leva só o que é dela; o resto sai como avulso, por call', () => {
    const log = createConnectionLog(() => 0)
    log.observe(at('reconnecting', 0), at('failed', 1, { error: 'x' }), 'c1')
    log.observe(at('connecting', 2), at('connected', 902), 'c2')
    log.observe(at('connected', 902), at('reconnecting', 1000), 'c2')
    log.observe(at('reconnecting', 1000), at('connected', 2000), 'c2')
    expect(log.take('c1')).toMatchObject({ connectMs: null, events: [{ type: 'conexao_falhou' }] })
    expect(log.takeStray('c3')).toMatchObject([{ callId: 'c2', events: [{ type: 'reconectou' }] }])
    expect(log.take('c2')).toEqual({ connectMs: 900, events: [] })
  })
})

describe('createConnectionLog: entrada', () => {
  it('a entrada lenta vai com os eventos', () => {
    let now = 0
    const log = createConnectionLog(() => now)
    const steps: [CallConnection, number][] = [
      [at('connecting', 0, { step: 'token' }), 0],
      [at('connected', 4000), 4000]
    ]
    let prev = at('idle', 0)
    for (const [next, t] of steps) {
      now = t
      log.observe(prev, next)
      prev = next
    }
    const { connectMs, events } = log.take('')
    expect(connectMs).toBe(4000)
    expect(events.map((e) => e.type)).toEqual(['entrada_lenta'])
  })
})

describe('changeCallId', () => {
  it('a call atual; ao sair, a anterior; sem nenhuma, vazio', () => {
    expect(changeCallId('c2', 'c1')).toBe('c2')
    expect(changeCallId(null, 'c1')).toBe('c1')
    expect(changeCallId(null, null)).toBe('')
  })
})
