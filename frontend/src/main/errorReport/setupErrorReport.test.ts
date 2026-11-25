import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Listener = (...args: unknown[]) => unknown
const appListeners = new Map<string, Listener>()
const handlers = new Map<string, Listener>()

vi.mock('electron', () => ({
  app: { on: (name: string, fn: Listener) => appListeners.set(name, fn) },
  ipcMain: { handle: (name: string, fn: Listener) => handlers.set(name, fn) }
}))

import { ERROR_REPORT_TAKE } from '../../shared/errorReport'
import { mainErrors } from './mainErrors'
import { recordProcessGone, setupErrorReport } from './setupErrorReport'

describe('setupErrorReport', () => {
  const contents = {}
  const processListeners = new Map<string, Listener>()

  beforeEach(() => {
    // Os ouvintes de verdade do processo do teste não são tocados.
    vi.spyOn(process, 'on').mockImplementation(((name: string, fn: Listener) => {
      processListeners.set(name, fn)
      return process
    }) as typeof process.on)
    setupErrorReport(() => ({ webContents: contents }) as never)
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    mainErrors.take()
    vi.restoreAllMocks()
  })

  it('exceção e promessa sem tratamento vão para o console e para a fila', () => {
    processListeners.get('uncaughtException')?.(new TypeError('x'))
    processListeners.get('unhandledRejection')?.(new Error('y'))
    expect(console.error).toHaveBeenCalledTimes(2)
    expect(mainErrors.take().map((e) => e.message)).toEqual(['x', 'y'])
  })

  it('renderer e processo filho que caíram vão; clean-exit não', () => {
    appListeners.get('render-process-gone')?.({}, {}, { reason: 'crashed', exitCode: 1 })
    appListeners.get('child-process-gone')?.({}, { reason: 'clean-exit', exitCode: 0, type: 'GPU' })
    appListeners.get('child-process-gone')?.({}, { reason: 'oom', exitCode: -5, type: 'GPU' })
    expect(mainErrors.take()).toEqual([
      { kind: 'render-process-gone', message: 'renderer crashed (código 1)', stack: '', count: 1 },
      { kind: 'child-process-gone', message: 'GPU oom (código -5)', stack: '', count: 1 }
    ])
  })

  it('só a janela principal esvazia a fila', () => {
    recordProcessGone('render-process-gone', { reason: 'crashed', exitCode: 1 })
    const take = handlers.get(ERROR_REPORT_TAKE)
    expect(take?.({ sender: {} })).toEqual([])
    expect(take?.({ sender: contents })).toHaveLength(1)
    expect(take?.({ sender: contents })).toEqual([])
  })
})
