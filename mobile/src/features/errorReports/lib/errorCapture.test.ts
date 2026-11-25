import { ApiError } from '../../../shared/api/client'
import { captureError, isExpected } from './errorCapture'

describe('captureError', () => {
  it('Error: tipo, mensagem e pilha limpos', () => {
    const error = new TypeError('falhou para ana@x.com')
    error.stack = 'TypeError: falhou para ana@x.com\n    at fn (address at index.android.bundle:1:2345)'
    expect(captureError(error)).toEqual({
      kind: 'TypeError',
      message: 'falhou para <email>',
      stack: 'TypeError: falhou para <email>\n    at fn (address at index.android.bundle:1:2345)'
    })
  })

  it('Error sem pilha: pilha vazia', () => {
    const error = new Error('x')
    error.stack = undefined
    expect(captureError(error)).toEqual({ kind: 'Error', message: 'x', stack: '' })
  })

  it('objeto com cara de erro (sem ser Error) também vale', () => {
    expect(captureError({ name: 'FooError', message: 'deu ruim' })).toEqual({ kind: 'FooError', message: 'deu ruim', stack: '' })
  })

  it('texto lançado: vira a mensagem, limpa', () => {
    expect(captureError('quebrou em /home/joao/x')).toEqual({ kind: 'NonError', message: 'quebrou em /home/<user>/x', stack: '' })
  })

  it('objeto qualquer: não manda o conteúdo, só o tipo', () => {
    expect(captureError({ senha: '123' })).toEqual({ kind: 'NonError', message: '[object Object]', stack: '' })
    expect(captureError(undefined)).toEqual({ kind: 'NonError', message: '[object Undefined]', stack: '' })
  })

  it('tipo estranho ou comprido é contido', () => {
    expect(captureError({ name: 'x'.repeat(100), message: 'm' }).kind).toHaveLength(64)
    expect(captureError({ name: '', message: 'm' }).kind).toBe('Error')
  })
})

describe('isExpected (rede esperada não vai)', () => {
  it.each([
    ['ApiError da nossa API', new ApiError(500, 'Request failed'), true],
    ['ApiError sem conexão', new ApiError(0, 'Sem conexão com o servidor'), true],
    ['fetch do RN sem rede', new TypeError('Network request failed'), true],
    ['AbortError', Object.assign(new Error('Aborted'), { name: 'AbortError' }), true],
    ['tempo esgotado', new Error('Request timed out'), true],
    ['Failed to fetch', new TypeError('Failed to fetch'), true],
    ['offline', new Error('The device is offline'), true],
    ['rejeição com texto de rede', 'Network request failed', true],
    ['bug de verdade', new TypeError("Cannot read property 'id' of undefined"), false],
    ['nada lançado', undefined, false]
  ])('%s → %s', (_nome, error, esperado) => {
    expect(isExpected(error)).toBe(esperado)
  })
})
