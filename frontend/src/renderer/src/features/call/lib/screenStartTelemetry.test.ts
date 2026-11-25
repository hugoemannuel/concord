import { beforeEach, describe, expect, it } from 'vitest'
import {
  failingAs,
  failureName,
  notePickerFailure,
  noteLiveFailure,
  noteLiveStart,
  takeLiveFailures,
  takeLiveStart
} from './screenStartTelemetry'

beforeEach(() => {
  takeLiveStart()
  takeLiveFailures()
})

describe('screenStartTelemetry', () => {
  it('tempo até a live no ar: leva uma vez só, arredondado', () => {
    noteLiveStart(2400.6)
    expect(takeLiveStart()).toBe(2401)
    expect(takeLiveStart()).toBeNull()
  })
  it('acima de 60 s não vale (a pessoa demorou, não a live)', () => {
    noteLiveStart(61_000)
    expect(takeLiveStart()).toBeNull()
  })
  it('falha ao começar: etapa e o nome do erro, na hora do fato', () => {
    noteLiveFailure('publicação', new DOMException('x', 'TimeoutError'), 1000)
    noteLiveFailure('nativo', 'capture_failed', 2000)
    expect(takeLiveFailures()).toEqual([
      { type: 'live_falhou', detail: 'publicação · TimeoutError', at: 1000 },
      { type: 'live_falhou', detail: 'nativo · capture_failed', at: 2000 }
    ])
    expect(takeLiveFailures()).toEqual([])
  })
  it('guarda no máximo as 5 últimas', () => {
    for (let i = 0; i < 7; i++) noteLiveFailure('seletor', new Error('x'), i)
    expect(takeLiveFailures().map((e) => e.at)).toEqual([2, 3, 4, 5, 6])
  })
})

describe('failingAs e notePickerFailure', () => {
  it('a etapa que rejeitou fica anotada e o erro segue', async () => {
    const err = new DOMException('x', 'InvalidStateError')
    await expect(failingAs('publicação', Promise.reject(err))).rejects.toBe(err)
    expect(await failingAs('codec', Promise.resolve(7))).toBe(7)
    expect(takeLiveFailures().map((e) => e.detail)).toEqual(['publicação · InvalidStateError'])
  })
  it('cancelar o seletor não é falha', () => {
    notePickerFailure(new DOMException('x', 'NotAllowedError'))
    notePickerFailure(new DOMException('x', 'NotReadableError'))
    expect(takeLiveFailures().map((e) => e.detail)).toEqual(['seletor · NotReadableError'])
  })
})

describe('failureName', () => {
  it('só o nome técnico, nunca a mensagem', () => {
    expect(failureName(new DOMException('caminho/secreto', 'NotReadableError'))).toBe(
      'NotReadableError'
    )
    expect(failureName(new TypeError('a'))).toBe('TypeError')
    expect(failureName('timeout')).toBe('timeout')
    expect(failureName('com espaço e texto livre')).toBe('erro')
    expect(failureName(null)).toBe('erro')
  })
})
