import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MainError } from '../../../../../shared/errorReport'
import type { ErrorSink } from '../../../shared/lib/errorSink'
import type { ErrorReport } from '../api/errorReports'
import { createErrorReports, type ErrorReportDeps } from './errorReports'
import { ERROR_FLUSH_MS } from './errorQueue'

const CONTEXT = { os: 'Linux', app_version: '1.4.2', target: 'desktop' as const }

function setup(over: Partial<ErrorReportDeps> = {}) {
  const events = new EventTarget()
  let sink: ErrorSink | null = null
  const sent: ErrorReport[][] = []
  const deps: ErrorReportDeps = {
    events: events as unknown as ErrorReportDeps['events'],
    setSink: (next) => (sink = next),
    screen: () => '/servers/:id',
    inCall: () => true,
    inLive: () => false,
    canSend: () => true,
    context: async () => CONTEXT,
    send: vi.fn(async (_context, errors: ErrorReport[]) => {
      sent.push(errors)
    }),
    every: (run, ms) => {
      const timer = setInterval(run, ms)
      return () => clearInterval(timer)
    },
    ...over
  }
  const reports = createErrorReports(deps)
  const fire = (type: string, init: Record<string, unknown>): void => {
    events.dispatchEvent(Object.assign(new Event(type), init))
  }
  return { reports, deps, sent, fire, sink: () => sink }
}

const flushAll = async (): Promise<void> => {
  await vi.advanceTimersByTimeAsync(ERROR_FLUSH_MS)
}

describe('createErrorReports', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('window.onerror vai a cada 30 s com tela, call e live', async () => {
    const { sent, fire, deps } = setup()
    fire('error', { error: new TypeError('x is undefined') })
    await vi.advanceTimersByTimeAsync(ERROR_FLUSH_MS - 1)
    expect(sent).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(deps.send).toHaveBeenCalledWith(CONTEXT, [
      {
        source: 'renderer',
        kind: 'TypeError',
        message: 'x is undefined',
        stack: expect.any(String),
        screen: '/servers/:id',
        in_call: true,
        in_live: false,
        count: 1
      }
    ])
  })

  it('promessa sem tratamento e tela de erro também vão; os esperados não', async () => {
    const { sent, fire, sink } = setup()
    fire('unhandledrejection', { reason: new Error('sem catch') })
    fire('unhandledrejection', { reason: new TypeError('Failed to fetch') })
    sink()?.(new RangeError('render quebrou'), 'tela')
    await flushAll()
    expect(sent[0].map((e) => e.message)).toEqual(['sem catch', 'render quebrou'])
  })

  it('puxa os erros do main ao iniciar e a cada envio, com a origem main', async () => {
    const main: MainError[] = [{ kind: 'render-process-gone', message: 'renderer crashed (código 1)', stack: '', count: 2 }]
    const takeMain = vi.fn(async () => main.splice(0))
    const { sent } = setup({ takeMain })
    await flushAll()
    expect(takeMain).toHaveBeenCalledTimes(2)
    expect(sent[0]).toEqual([
      {
        source: 'main',
        kind: 'render-process-gone',
        message: 'renderer crashed (código 1)',
        stack: '',
        screen: '',
        in_call: true,
        in_live: false,
        count: 2
      }
    ])
  })

  it('ponte do main que falha não impede o envio', async () => {
    const { sent, fire } = setup({ takeMain: () => Promise.reject(new Error('sem ponte')) })
    fire('error', { error: new Error('x') })
    await flushAll()
    expect(sent).toHaveLength(1)
  })

  it('sem conta guarda até ter', async () => {
    let logged = false
    const { sent, fire } = setup({ canSend: () => logged })
    fire('error', { error: new Error('x') })
    await flushAll()
    expect(sent).toHaveLength(0)
    logged = true
    await flushAll()
    expect(sent).toHaveLength(1)
  })

  it('erro ao ler a tela não vira outro erro', () => {
    const { fire } = setup({
      screen: () => {
        throw new Error('quebrou')
      }
    })
    expect(() => fire('error', { error: new Error('x') })).not.toThrow()
  })

  it('stop desliga tudo', async () => {
    const { reports, sent, fire, sink } = setup()
    reports.stop()
    expect(sink()).toBeNull()
    fire('error', { error: new Error('x') })
    await flushAll()
    expect(sent).toHaveLength(0)
  })
})
