import { EventEmitter } from 'events'
import { describe, expect, it, vi } from 'vitest'
import { keepCaptureTimer, type CaptureTimerDeps } from './captureTimer'

function deps(over: Partial<CaptureTimerDeps> = {}) {
  const child = new EventEmitter()
  const run = vi.fn(() => child)
  const log = vi.fn()
  const d: CaptureTimerDeps = {
    platform: 'win32',
    helper: 'C:/app/concord-audio.exe',
    pid: 4242,
    exists: () => true,
    run,
    log,
    ...over
  }
  return { d, child, run, log }
}

describe('keepCaptureTimer', () => {
  it('regressão: janela coberta derrubava a captura para 32 fps: pede ao helper para manter o temporizador do app', () => {
    const { d, run } = deps()
    keepCaptureTimer(d)
    expect(run).toHaveBeenCalledWith('C:/app/concord-audio.exe', ['keep-timer', '4242'])
  })

  it('fora do Windows não faz nada', () => {
    const { d, run } = deps({ platform: 'linux' })
    keepCaptureTimer(d)
    expect(run).not.toHaveBeenCalled()
  })

  it('sem o helper no disco: a live segue como antes', () => {
    const { d, run } = deps({ exists: () => false })
    keepCaptureTimer(d)
    expect(run).not.toHaveBeenCalled()
  })

  it('helper que falha não derruba o app, só fica no log', () => {
    const { d, child, log } = deps()
    keepCaptureTimer(d)
    child.emit('exit', 1)
    expect(log).toHaveBeenCalledWith(expect.stringContaining('keep-timer saiu com 1'))
    child.emit('error', new Error('ENOENT'))
    expect(log).toHaveBeenCalledWith(expect.stringContaining('ENOENT'))
  })

  it('deu certo: não escreve nada no log', () => {
    const { d, child, log } = deps()
    keepCaptureTimer(d)
    child.emit('exit', 0)
    expect(log).not.toHaveBeenCalled()
  })
})
