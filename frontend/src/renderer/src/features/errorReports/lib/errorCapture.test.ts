import { describe, expect, it } from 'vitest'
import { ApiError } from '../../../shared/api/client'
import {
  captureError,
  captureErrorEvent,
  captureRejection,
  firstFrame,
  isExpected,
  rawError
} from './errorCapture'

function withStack(error: Error, stack: string): Error {
  error.stack = stack
  return error
}

describe('captureError', () => {
  it('Error vira tipo, mensagem e pilha limpos', () => {
    const error = withStack(
      new TypeError("Cannot read properties of undefined (reading 'id')"),
      "TypeError: Cannot read properties of undefined (reading 'id')\n    at Xy (https://app/assets/index-abc.js:1:2)"
    )
    expect(captureError(error)).toEqual({
      kind: 'TypeError',
      message: "Cannot read properties of undefined (reading 'id')",
      stack: "TypeError: Cannot read properties of undefined (reading 'id')\n    at Xy (assets/index-abc.js:1:2)"
    })
  })

  it('a mensagem sai limpa', () => {
    expect(captureError(new Error('canal 3f2b8c1e-9a4d-4e7b-8c2a-1b2c3d4e5f60 de ana@x.com'))?.message).toBe(
      'canal <id> de <email>'
    )
  })

  it.each([
    ['string lançada', 'deu ruim', { kind: 'NonError', message: 'deu ruim', stack: '' }],
    ['número lançado', 42, { kind: 'NonError', message: '42', stack: '' }],
    ['undefined lançado', undefined, { kind: 'NonError', message: 'undefined', stack: '' }],
    ['objeto com message', { message: 'oi' }, { kind: 'Error', message: 'oi', stack: '' }],
    ['objeto com name', { name: 'Falha', message: 'oi', stack: 's' }, { kind: 'Falha', message: 'oi', stack: 's' }]
  ])('%s', (_name, value, want) => {
    expect(rawError(value)).toEqual(want)
  })
})

describe('isExpected (o que não vai)', () => {
  const network = (message: string, name = 'TypeError'): unknown => {
    const error = new Error(message)
    error.name = name
    return error
  }

  it.each([
    ['fetch que falhou (Chrome)', network('Failed to fetch')],
    ['fetch que falhou (Firefox)', network('NetworkError when attempting to fetch resource.')],
    ['fetch que falhou (Safari)', network('Load failed')],
    ['AbortError', network('The user aborted a request.', 'AbortError')],
    ['ApiError da nossa API', new ApiError(500, 'Request failed')],
    ['chunk que não baixou', network('Failed to fetch dynamically imported module: https://app/assets/x.js')],
    ['chunk no Firefox', network('error loading dynamically imported module: https://app/x.js')],
    ['chunk no Safari', network('Importing a module script failed.')],
    ['CSS do chunk', network('Unable to preload CSS for /assets/x.css')],
    ['ResizeObserver', network('ResizeObserver loop completed with undelivered notifications.')],
    ['script de outra origem', network('Script error.')],
    ['resposta de rota do react-router', { status: 404, statusText: 'Not Found', data: '' }],
    [
      'pilha que começa em extensão (Chrome)',
      withStack(new Error('x'), 'Error: x\n    at f (chrome-extension://abc/content.js:1:2)\n    at g (https://app/assets/i.js:1:2)')
    ],
    ['pilha que começa em extensão (Firefox)', withStack(new Error('x'), 'f@moz-extension://abc/c.js:1:2\ng@https://app/i.js:1:2')],
    ['pilha que começa em extensão (Safari)', withStack(new Error('x'), 'f@safari-web-extension://abc/c.js:1:2')]
  ])('%s', (_name, value) => {
    expect(isExpected(value, rawError(value))).toBe(true)
    expect(captureError(value)).toBeNull()
  })

  it.each([
    ['TypeError comum', new TypeError('x is undefined')],
    [
      'extensão só no meio da pilha',
      withStack(new Error('x'), 'Error: x\n    at g (https://app/assets/i.js:1:2)\n    at f (chrome-extension://abc/c.js:1:2)')
    ],
    ['string lançada', 'deu ruim']
  ])('%s vai', (_name, value) => {
    expect(isExpected(value, rawError(value))).toBe(false)
  })
})

describe('firstFrame', () => {
  it.each([
    ['V8 pula a linha da mensagem', 'Error: a@b\n    at f (x.js:1:2)\n    at g (y.js:1:2)', 'at f (x.js:1:2)'],
    ['Firefox', 'f@x.js:1:2\ng@y.js:1:2', 'f@x.js:1:2'],
    ['sem quadro', 'Error: x', ''],
    ['vazia', '', '']
  ])('%s', (_name, stack, want) => {
    expect(firstFrame(stack)).toBe(want)
  })
})

describe('eventos do window', () => {
  it('ErrorEvent com o erro usa o erro', () => {
    expect(captureErrorEvent({ error: new RangeError('fora'), message: 'Uncaught RangeError: fora' })).toMatchObject({
      kind: 'RangeError',
      message: 'fora'
    })
  })

  it('ErrorEvent sem o erro usa a mensagem e o lugar', () => {
    expect(
      captureErrorEvent({ message: 'Uncaught x', filename: 'https://app/assets/i.js?v=1', lineno: 3, colno: 9 })
    ).toEqual({ kind: 'Error', message: 'Uncaught x', stack: '    at assets/i.js:3:9' })
  })

  it('ErrorEvent de outra origem não vai', () => {
    expect(captureErrorEvent({ message: 'Script error.', filename: '', lineno: 0, colno: 0 })).toBeNull()
  })

  it('promessa rejeitada usa o motivo', () => {
    expect(captureRejection({ reason: new Error('sem tratamento') })).toMatchObject({
      kind: 'Error',
      message: 'sem tratamento'
    })
    expect(captureRejection({ reason: new ApiError(401, 'x') })).toBeNull()
  })
})
