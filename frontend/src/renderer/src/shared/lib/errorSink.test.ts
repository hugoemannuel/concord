import { afterEach, describe, expect, it, vi } from 'vitest'
import { reportAppError, setErrorSink } from './errorSink'

describe('errorSink', () => {
  afterEach(() => setErrorSink(null))

  it('sem destino ligado não faz nada', () => {
    expect(() => reportAppError(new Error('x'), 'tela')).not.toThrow()
  })

  it('entrega o erro e onde foi pego ao destino ligado', () => {
    const sink = vi.fn()
    setErrorSink(sink)
    const error = new Error('x')
    reportAppError(error, 'rota')
    expect(sink).toHaveBeenCalledWith(error, 'rota')
  })

  it('destino que quebra não derruba quem avisou', () => {
    setErrorSink(() => {
      throw new Error('relatório quebrou')
    })
    expect(() => reportAppError(new Error('x'), 'tela')).not.toThrow()
  })
})
