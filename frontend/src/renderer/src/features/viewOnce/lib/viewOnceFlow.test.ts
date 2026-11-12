import { describe, expect, it, vi } from 'vitest'
import { createViewOnceFlow, flowOutcome, viewerResult, type FlowState } from './viewOnceFlow'

function setup(openImpl?: () => Promise<{ token: string }>) {
  const open = vi.fn(openImpl ?? (() => Promise.resolve({ token: 't1' })))
  const protect = vi.fn()
  const states: FlowState[] = []
  const flow = createViewOnceFlow(
    'a1',
    { open, protect, src: (id, t) => `/m/${id}?token=${t}` },
    (s) => states.push(s)
  )
  const last = (): FlowState => states[states.length - 1]
  return { open, protect, flow, last }
}

describe('createViewOnceFlow', () => {
  it('cancelar não abre nem liga a proteção', () => {
    const { open, protect, flow, last } = setup()
    flow.cancel()
    expect(open).not.toHaveBeenCalled()
    expect(protect).not.toHaveBeenCalled()
    expect(last().phase).toBe('closed')
  })

  it('"Ver" abre uma vez e liga a proteção; fechar desliga e solta o src', async () => {
    const { open, protect, flow, last } = setup()
    await flow.confirm()
    await flow.confirm()
    expect(open).toHaveBeenCalledTimes(1)
    expect(protect).toHaveBeenCalledWith(true)
    expect(last()).toEqual({ phase: 'open', src: '/m/a1?token=t1' })
    flow.close()
    expect(protect).toHaveBeenLastCalledWith(false)
    expect(last()).toEqual({ phase: 'closed', src: null })
  })

  it('Esc fecha e desliga a proteção uma única vez', async () => {
    const { protect, flow, last } = setup()
    await flow.confirm()
    flow.onKey('Escape')
    flow.close()
    expect(last().phase).toBe('closed')
    expect(protect.mock.calls.filter((c) => c[0] === false)).toHaveLength(1)
  })

  it('410 vira "gone" e desliga a proteção', async () => {
    const { protect, flow, last } = setup(() => Promise.reject({ status: 410 }))
    await flow.confirm()
    expect(last().phase).toBe('gone')
    expect(protect).toHaveBeenLastCalledWith(false)
  })

  it('outro erro vira "failed" e desliga a proteção', async () => {
    const { protect, flow, last } = setup(() => Promise.reject(new Error('x')))
    await flow.confirm()
    expect(last().phase).toBe('failed')
    expect(protect).toHaveBeenLastCalledWith(false)
  })

  it('403 vira "forbidden" e desliga a proteção', async () => {
    const { protect, flow, last } = setup(() => Promise.reject({ status: 403 }))
    await flow.confirm()
    expect(last().phase).toBe('forbidden')
    expect(protect).toHaveBeenLastCalledWith(false)
  })

  it('falha guarda o erro para o aviso', async () => {
    const err = new Error('sem rede')
    const { flow, last } = setup(() => Promise.reject(err))
    await flow.confirm()
    expect(last()).toEqual({ phase: 'failed', src: null, error: err })
  })

  it('dispose (desmontar, StrictMode) solta a proteção sem relatar nada', async () => {
    const { protect, flow, last } = setup()
    await flow.confirm()
    const seen = last()
    flow.dispose()
    expect(protect).toHaveBeenLastCalledWith(false)
    expect(last()).toBe(seen)
    flow.close()
    flow.onKey('Escape')
    expect(last()).toBe(seen)
    expect(protect.mock.calls.filter((c) => c[0] === false)).toHaveLength(1)
  })

  it('dispose durante o carregamento: a resposta que chega depois não muda nada', async () => {
    let resolve!: (v: { token: string }) => void
    const { flow, last, protect } = setup(() => new Promise((r) => (resolve = r)))
    const p = flow.confirm()
    const loading = last()
    flow.dispose()
    resolve({ token: 't' })
    await p
    expect(last()).toBe(loading)
    expect(protect).toHaveBeenLastCalledWith(false)
  })

  it('fechar durante o carregamento não mostra a mídia depois', async () => {
    let resolve!: (v: { token: string }) => void
    const { flow, last, protect } = setup(() => new Promise((r) => (resolve = r)))
    const p = flow.confirm()
    flow.close()
    resolve({ token: 't' })
    await p
    expect(last().phase).toBe('closed')
    expect(protect).toHaveBeenLastCalledWith(false)
  })
})

describe('flowOutcome', () => {
  const at = (phase: FlowState['phase']): FlowState => ({ phase, src: null })

  it('só termina em closed, gone ou failed', () => {
    expect(flowOutcome(at('confirm'), false)).toBeNull()
    expect(flowOutcome(at('loading'), false)).toBeNull()
    expect(flowOutcome({ phase: 'open', src: '/x' }, true)).toBeNull()
    expect(flowOutcome(at('gone'), false)).toBe('gone')
    expect(flowOutcome(at('failed'), false)).toBe('failed')
    expect(flowOutcome(at('forbidden'), false)).toBe('forbidden')
  })

  it('fechar depois de abrir é visto; antes, cancelado', () => {
    expect(flowOutcome(at('closed'), true)).toBe('seen')
    expect(flowOutcome(at('closed'), false)).toBe('cancelled')
  })
})

describe('viewerResult', () => {
  it('falha: aviso do padrão do app (mensagem do erro ou "Sem conexão com o servidor") e cancela', () => {
    expect(viewerResult('failed', new Error('Arquivo grande'))).toEqual({
      outcome: 'cancelled',
      toast: 'Arquivo grande'
    })
    expect(viewerResult('failed', { status: 500 })).toEqual({
      outcome: 'cancelled',
      toast: 'Sem conexão com o servidor'
    })
  })

  it('os outros resultados passam sem aviso', () => {
    for (const o of ['seen', 'gone', 'cancelled', 'forbidden'] as const) {
      expect(viewerResult(o, undefined)).toEqual({ outcome: o, toast: null })
    }
  })
})
