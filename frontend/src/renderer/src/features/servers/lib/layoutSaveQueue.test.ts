import { describe, expect, it, vi } from 'vitest'
import { createLayoutSaveQueue, layoutSaveErrorText } from './layoutSaveQueue'

function deferred(): { promise: Promise<void>; resolve: () => void; reject: (err: unknown) => void } {
  let resolve = (): void => {}
  let reject = (_err: unknown): void => {}
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const flush = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

describe('fila de gravação da organização', () => {
  it('um pedido por vez; do que chegou no meio, só o último sai', async () => {
    const calls = [deferred(), deferred()]
    const send = vi.fn().mockImplementationOnce(() => calls[0].promise).mockImplementationOnce(() => calls[1].promise)
    const onIdle = vi.fn()
    const queue = createLayoutSaveQueue<string>({ send, onIdle, onFailed: vi.fn() })
    queue.submit('primeiro')
    queue.submit('segundo')
    queue.submit('terceiro')
    expect(send.mock.calls).toEqual([['primeiro']])
    expect(queue.busy()).toBe(true)
    calls[0].resolve()
    await flush()
    expect(send.mock.calls).toEqual([['primeiro'], ['terceiro']])
    expect(onIdle).not.toHaveBeenCalled()
    calls[1].resolve()
    await flush()
    expect(onIdle).toHaveBeenCalledTimes(1)
    expect(queue.busy()).toBe(false)
  })
  it('falhou: descarta o que esperava e avisa uma vez', async () => {
    const call = deferred()
    const send = vi.fn(() => call.promise)
    const onFailed = vi.fn()
    const onIdle = vi.fn()
    const queue = createLayoutSaveQueue<string>({ send, onIdle, onFailed })
    queue.submit('a')
    queue.submit('b')
    const error = new Error('recusado')
    call.reject(error)
    await flush()
    expect(send).toHaveBeenCalledTimes(1)
    expect(onFailed).toHaveBeenCalledWith(error)
    expect(onIdle).not.toHaveBeenCalled()
    expect(queue.busy()).toBe(false)
  })
})

describe('layoutSaveErrorText', () => {
  it('explica o conflito com outra pessoa', () => {
    expect(layoutSaveErrorText({ status: 409 })).toContain('mudou enquanto você organizava')
  })
  it('demais erros têm a mensagem geral', () => {
    expect(layoutSaveErrorText({ status: 500 })).toBe('Não foi possível salvar a organização dos canais.')
    expect(layoutSaveErrorText(new Error('rede'))).toBe('Não foi possível salvar a organização dos canais.')
  })
})
