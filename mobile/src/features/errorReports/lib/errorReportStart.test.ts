import { ApiError } from '../../../shared/api/client'
import { reportAppError } from '../../../shared/lib/errorSink'
import { useCallSessionStore } from '../../call/store/callSessionStore'
import { useScreenShareStore } from '../../call/store/screenShareStore'
import type { ErrorReport } from './errorQueue'
import { callContext, sendReports, setErrorScreen, startErrorReports, stopErrorReports } from './errorReportStart'
import type { GlobalHandler } from './globalErrorHandlers'

jest.mock('../api/errorReports', () => ({ postErrors: jest.fn() }))

function fakeErrorUtils() {
  const previous = jest.fn()
  let handler: GlobalHandler = previous
  return {
    previous,
    errorUtils: { getGlobalHandler: () => handler, setGlobalHandler: (next: GlobalHandler) => (handler = next) },
    fire: (error: unknown, isFatal?: boolean) => handler(error, isFatal)
  }
}

function start(overrides: Parameters<typeof startErrorReports>[0] = {}) {
  const fake = fakeErrorUtils()
  const post = jest.fn(async (_batch: ErrorReport[]) => undefined)
  const started = startErrorReports({
    errorUtils: fake.errorUtils,
    hermes: null,
    isDev: false,
    canSend: () => true,
    callContext: () => ({ in_call: true, in_live: false }),
    post,
    ...overrides
  })
  return { ...fake, post, started }
}

describe('startErrorReports', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => {
    stopErrorReports()
    setErrorScreen('/')
    jest.useRealTimers()
  })

  it('erro da tela (ErrorBoundary) sai no envio de 30 s com a tela e a chamada', async () => {
    const { post } = start()
    setErrorScreen('/canal/:channelId')
    reportAppError(new TypeError('quebrou'), 'tela')
    await jest.advanceTimersByTimeAsync(30_000)
    expect(post).toHaveBeenCalledWith([
      expect.objectContaining({ source: 'mobile', kind: 'TypeError', screen: '/canal/:channelId', in_call: true, count: 1 })
    ])
  })

  it('erro global fatal: manda na hora e depois chama o handler anterior', async () => {
    const { post, fire, previous } = start()
    const error = new Error('fatal')
    fire(error, true)
    expect(post).toHaveBeenCalledTimes(1)
    await jest.advanceTimersByTimeAsync(0)
    expect(previous).toHaveBeenCalledWith(error, true)
  })

  it('erro fatal cujo envio trava: o anterior é chamado depois de no máximo 2 s', async () => {
    const { fire, previous } = start({ post: () => new Promise(() => undefined) })
    fire(new Error('fatal'), true)
    await jest.advanceTimersByTimeAsync(1_999)
    expect(previous).not.toHaveBeenCalled()
    await jest.advanceTimersByTimeAsync(1)
    expect(previous).toHaveBeenCalledTimes(1)
  })

  it('no dev o fatal não espera o envio', async () => {
    const { fire, previous, post } = start({ isDev: true })
    fire(new Error('fatal'), true)
    await jest.advanceTimersByTimeAsync(0)
    expect(previous).toHaveBeenCalledTimes(1)
    expect(post).not.toHaveBeenCalled()
  })

  it('promessa rejeitada sem tratamento (Hermes, fora do dev) vai para a fila', async () => {
    let onUnhandled: (id: number, rejection: unknown) => void = () => undefined
    const hermes = { enablePromiseRejectionTracker: (o: { onUnhandled: typeof onUnhandled }) => (onUnhandled = o.onUnhandled) }
    const { post } = start({ hermes })
    onUnhandled(1, new RangeError('fora do limite'))
    await jest.advanceTimersByTimeAsync(30_000)
    expect(post).toHaveBeenCalledWith([expect.objectContaining({ kind: 'RangeError' })])
  })

  it('liga uma vez só', () => {
    expect(start().started).toBe(true)
    expect(start().started).toBe(false)
  })
})

describe('sendReports', () => {
  it.each([
    ['400 (corpo inválido) é descartado', 400, 'resolves'],
    ['413 é descartado', 413, 'resolves'],
    ['401 volta para a fila', 401, 'rejects'],
    ['429 volta para a fila', 429, 'rejects'],
    ['5xx volta para a fila', 503, 'rejects'],
    ['sem rede volta para a fila', 0, 'rejects']
  ])('%s', async (_nome, status, esperado) => {
    const post = jest.fn().mockRejectedValue(new ApiError(status, 'x'))
    const result = sendReports([], post)
    if (esperado === 'resolves') await expect(result).resolves.toBeUndefined()
    else await expect(result).rejects.toBeInstanceOf(ApiError)
  })

  it('outro erro volta para a fila', async () => {
    await expect(sendReports([], jest.fn().mockRejectedValue(new TypeError('x')))).rejects.toBeInstanceOf(TypeError)
  })
})

describe('callContext (só leitura dos stores da chamada)', () => {
  afterEach(() => {
    useCallSessionStore.getState().reset()
    useScreenShareStore.getState().reset()
  })

  it('fora de chamada', () => {
    expect(callContext()).toEqual({ in_call: false, in_live: false })
  })

  it('tocando não é estar em chamada', () => {
    useCallSessionStore.getState().begin({ callId: 'c', kind: 'channel', phase: 'ringing' })
    expect(callContext().in_call).toBe(false)
  })

  it('em chamada, transmitindo a tela', () => {
    useCallSessionStore.getState().begin({ callId: 'c', kind: 'channel', phase: 'active' })
    useScreenShareStore.getState().setSharing(true)
    expect(callContext()).toEqual({ in_call: true, in_live: true })
  })

  it('assistindo a transmissão de alguém também é live', () => {
    useScreenShareStore.getState().setSharers(['u2'])
    useScreenShareStore.getState().setWatching('u2')
    expect(callContext().in_live).toBe(true)
  })
})
