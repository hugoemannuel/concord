import { ApiError } from '../../../shared/api/client'
import { createErrorReporter } from './errorReporter'
import type { ReportInput } from './errorQueue'

function setup() {
  const added: ReportInput[] = []
  const reporter = createErrorReporter({
    add: (input) => added.push(input),
    context: () => ({ screen: '/canal/:channelId', in_call: true, in_live: false })
  })
  return { reporter, added }
}

describe('createErrorReporter', () => {
  it('erro de verdade: vai limpo para a fila com a tela e a chamada', () => {
    const { reporter, added } = setup()
    const error = new TypeError('quebrou para ana@x.com')
    error.stack = 'TypeError: quebrou\n    at f@1:2'
    reporter.record(error)
    expect(added).toEqual([
      {
        kind: 'TypeError',
        message: 'quebrou para <email>',
        stack: 'TypeError: quebrou\n    at f@1:2',
        screen: '/canal/:channelId',
        in_call: true,
        in_live: false
      }
    ])
  })

  it('erro esperado (rede, ApiError) não vai', () => {
    const { reporter, added } = setup()
    reporter.record(new ApiError(500, 'Request failed'))
    reporter.record(new TypeError('Network request failed'))
    expect(added).toEqual([])
  })

  it('falha ao montar o relatório não lança', () => {
    const reporter = createErrorReporter({
      add: () => {
        throw new Error('fila quebrada')
      },
      context: () => ({ screen: '/', in_call: false, in_live: false })
    })
    expect(() => reporter.record(new Error('x'))).not.toThrow()
  })
})
