import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../shared/api/client'
import type { ErrorReport } from '../api/errorReports'
import {
  createErrorQueue,
  errorKey,
  MAX_COUNT,
  MAX_KEYS_PER_SESSION,
  MAX_PER_SEND,
  MAX_SEND_BYTES,
  REJECTED_PAUSE_MS,
  takeBatch,
  type QueuedError
} from './errorQueue'

function error(message: string, over: Partial<QueuedError> = {}): QueuedError {
  return {
    source: 'renderer',
    kind: 'TypeError',
    message,
    stack: `TypeError: ${message}\n    at f (assets/index-abc.js:1:2)`,
    screen: '/friends',
    in_call: false,
    in_live: false,
    ...over
  }
}

let clock = 0

function setup(canSend = true) {
  const sent: ErrorReport[][] = []
  const send = vi.fn(async (errors: ErrorReport[]) => {
    sent.push(errors)
  })
  let logged = canSend
  const queue = createErrorQueue({ send, canSend: () => logged, now: () => clock })
  return { queue, send, sent, login: () => (logged = true) }
}

describe('errorKey', () => {
  it('origem, tipo, mensagem e 1º quadro; linha seguinte e tela não contam', () => {
    const a = error('x', { stack: 'TypeError: x\n    at f (a.js:1:2)\n    at g (b.js:1:2)', screen: '/a' })
    const b = error('x', { stack: 'TypeError: x\n    at f (a.js:1:2)\n    at h (c.js:1:2)', screen: '/b' })
    expect(errorKey(a)).toBe(errorKey(b))
    expect(errorKey(a)).not.toBe(errorKey(error('x', { stack: 'TypeError: x\n    at z (a.js:9:9)' })))
    expect(errorKey(a)).not.toBe(errorKey({ ...a, source: 'main' }))
  })
})

describe('createErrorQueue', () => {
  it('o mesmo erro soma a contagem e vai uma vez', async () => {
    const { queue, sent } = setup()
    queue.add(error('x'))
    queue.add(error('x'))
    queue.add(error('x'), 3)
    await queue.flush()
    expect(sent).toHaveLength(1)
    expect(sent[0]).toEqual([{ ...error('x'), count: 5 }])
    expect(queue.pending()).toBe(0)
  })

  it('a contagem não passa de 10 000', async () => {
    const { queue, sent } = setup()
    queue.add(error('x'), MAX_COUNT)
    queue.add(error('x'), 5)
    await queue.flush()
    expect(sent[0][0].count).toBe(MAX_COUNT)
  })

  it('sem nada na fila não manda', async () => {
    const { queue, send } = setup()
    await queue.flush()
    expect(send).not.toHaveBeenCalled()
  })

  it('até 10 erros por envio; o resto vai no próximo', async () => {
    const { queue, sent } = setup()
    for (let i = 0; i < 15; i++) queue.add(error(`e${i}`))
    await queue.flush()
    expect(sent[0]).toHaveLength(MAX_PER_SEND)
    expect(queue.pending()).toBe(5)
    await queue.flush()
    expect(sent[1].map((e) => e.message)).toEqual(['e10', 'e11', 'e12', 'e13', 'e14'])
  })

  it('até 50 erros distintos por sessão; o resto é descartado', async () => {
    const { queue } = setup(false)
    for (let i = 0; i < MAX_KEYS_PER_SESSION + 20; i++) queue.add(error(`e${i}`))
    expect(queue.pending()).toBe(MAX_KEYS_PER_SESSION)
  })

  it('erro já visto e já mandado volta a contar (não ocupa outra vaga)', async () => {
    const { queue, sent } = setup()
    for (let i = 0; i < MAX_KEYS_PER_SESSION; i++) queue.add(error(`e${i}`))
    for (let i = 0; i < 5; i++) await queue.flush()
    expect(queue.pending()).toBe(0)
    queue.add(error('e0'), 2)
    queue.add(error('novo'))
    expect(queue.pending()).toBe(1)
    await queue.flush()
    expect(sent.at(-1)).toEqual([{ ...error('e0'), count: 2 }])
  })

  it('sem conta guarda; ao logar manda', async () => {
    const { queue, send, sent, login } = setup(false)
    queue.add(error('x'))
    await queue.flush()
    expect(send).not.toHaveBeenCalled()
    login()
    await queue.flush()
    expect(sent[0]).toHaveLength(1)
  })

  it('falha no envio mantém para o próximo e continua somando', async () => {
    const { queue, send, sent } = setup()
    queue.add(error('x'), 2)
    send.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await queue.flush()
    expect(queue.pending()).toBe(1)
    queue.add(error('x'))
    await queue.flush()
    expect(sent.at(-1)).toEqual([{ ...error('x'), count: 3 }])
  })

  it('429 fica para o próximo', async () => {
    const { queue, send } = setup()
    queue.add(error('x'))
    send.mockRejectedValueOnce(new ApiError(429, 'muitos'))
    await queue.flush()
    expect(queue.pending()).toBe(1)
    await queue.flush()
    expect(send).toHaveBeenCalledTimes(2)
  })

  it.each([401, 403])('%i guarda e espera 5 min antes de tentar de novo', async (status) => {
    const { queue, send } = setup()
    queue.add(error('x'))
    send.mockRejectedValueOnce(new ApiError(status, 'recusado'))
    await queue.flush()
    expect(queue.pending()).toBe(1)
    clock += REJECTED_PAUSE_MS - 1
    await queue.flush()
    expect(send).toHaveBeenCalledTimes(1)
    clock += 1
    await queue.flush()
    expect(send).toHaveBeenCalledTimes(2)
    expect(queue.pending()).toBe(0)
  })

  it('400 descarta o lote (repetir não resolve)', async () => {
    const { queue, send } = setup()
    queue.add(error('x'))
    send.mockRejectedValueOnce(new ApiError(400, 'corpo inválido'))
    await queue.flush()
    expect(queue.pending()).toBe(0)
  })

  it('o que chega durante o envio fica para o próximo', async () => {
    const { queue, send, sent } = setup()
    let release: () => void = () => {}
    send.mockImplementationOnce(
      (errors) =>
        new Promise<void>((resolve) => {
          sent.push(errors)
          release = resolve
        })
    )
    queue.add(error('x'))
    const first = queue.flush()
    queue.add(error('x'), 4)
    // Um envio por vez.
    await queue.flush()
    expect(send).toHaveBeenCalledTimes(1)
    release()
    await first
    expect(queue.pending()).toBe(1)
    await queue.flush()
    expect(sent.at(-1)).toEqual([{ ...error('x'), count: 4 }])
  })
})

describe('takeBatch', () => {
  const big = (i: number): ErrorReport => ({ ...error(`e${i}`, { stack: 'x'.repeat(4000) }), count: 1 })

  it('corta antes de passar do tamanho do pedido', () => {
    const batch = takeBatch(Array.from({ length: 10 }, (_, i) => big(i)))
    expect(batch.length).toBeLessThan(10)
    expect(new TextEncoder().encode(JSON.stringify(batch)).length).toBeLessThanOrEqual(MAX_SEND_BYTES)
  })

  it('pelo menos um', () => {
    expect(takeBatch([big(0)])).toHaveLength(1)
  })
})
