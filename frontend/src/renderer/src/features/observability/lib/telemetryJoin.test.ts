import { describe, expect, it } from 'vitest'
import type { CallConnection } from '../../call/lib/callConnection'
import { createJoinTracker } from './telemetryJoin'

const at = (
  phase: CallConnection['phase'],
  since: number,
  step: CallConnection['step'] = null
): CallConnection => ({ phase, step, since, error: null })

/** Passa as fases na ordem, com a hora de cada mudança; devolve os eventos. */
function run(changes: [CallConnection, number][]): { type: string; detail: string }[] {
  const observe = createJoinTracker()
  const out: { type: string; detail: string }[] = []
  let prev = at('idle', 0)
  for (const [next, now] of changes) {
    const event = observe(prev, next, now)
    if (event) out.push(event)
    prev = next
  }
  return out
}

describe('createJoinTracker', () => {
  it('entrada lenta (> 3 s): o tempo de cada etapa', () => {
    expect(
      run([
        [at('connecting', 1000, 'token'), 1000],
        [at('connecting', 1000, 'signal'), 1200],
        [at('connecting', 1000, 'media'), 1600],
        [at('connected', 5700), 5700]
      ])
    ).toEqual([{ type: 'entrada_lenta', detail: 'acesso 0,2 s · sinal 0,4 s · mídia 4,1 s' }])
  })

  it('entrada rápida não gera nada', () => {
    expect(
      run([
        [at('connecting', 0, 'token'), 0],
        [at('connecting', 0, 'signal'), 300],
        [at('connected', 900), 900]
      ])
    ).toEqual([])
  })

  it('nova tentativa durante a entrada: abandonada, com a etapa e o tempo', () => {
    expect(
      run([
        [at('connecting', 0, 'token'), 0],
        [at('connecting', 0, 'media'), 500],
        [at('connecting', 12_300, 'token'), 12_300],
        [at('connected', 13_000), 13_000]
      ])
    ).toEqual([{ type: 'entrada_abandonada', detail: 'nova tentativa · mídia · 12,3 s' }])
  })

  it('saiu durante a entrada: abandonada', () => {
    expect(
      run([
        [at('connecting', 0, 'token'), 0],
        [at('connecting', 0, 'signal'), 400],
        [at('idle', 0), 8000]
      ])
    ).toEqual([{ type: 'entrada_abandonada', detail: 'saiu · sinal · 8 s' }])
  })

  it('falhou durante a entrada não é abandono (já vira conexao_falhou)', () => {
    expect(run([[at('connecting', 0, 'token'), 0], [at('failed', 9000), 9000]])).toEqual([])
  })

  it('a entrada depois de uma falha mede do zero', () => {
    expect(
      run([
        [at('connecting', 0, 'media'), 0],
        [at('failed', 9000), 9000],
        [at('connecting', 20_000, 'token'), 20_000],
        [at('connected', 20_500), 20_500]
      ])
    ).toEqual([])
  })
})
