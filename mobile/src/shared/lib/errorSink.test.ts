import { reportAppError, setErrorSink } from './errorSink'

describe('errorSink', () => {
  afterEach(() => setErrorSink(null))

  it('sem destino ligado: reportar não faz nada nem lança', () => {
    expect(() => reportAppError(new Error('x'), 'tela')).not.toThrow()
  })

  it('com destino ligado: repassa o erro e onde aconteceu', () => {
    const sink = jest.fn()
    setErrorSink(sink)
    const error = new Error('boom')
    reportAppError(error, 'tela')
    expect(sink).toHaveBeenCalledWith(error, 'tela')
  })

  it('destino que lança não derruba quem reportou', () => {
    setErrorSink(() => {
      throw new Error('destino quebrado')
    })
    expect(() => reportAppError(new Error('x'), 'tela')).not.toThrow()
  })
})
