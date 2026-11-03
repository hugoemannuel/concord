import { describe, expect, it, vi } from 'vitest'
import { shareStreams, type ShareDeps } from './shareSource'

const win = { id: 'window:9:0', name: 'Jogo' } as Electron.DesktopCapturerSource
const screen = { id: 'screen:0:0', name: 'Tela' } as Electron.DesktopCapturerSource

function deps(over: Partial<ShareDeps> = {}): ShareDeps {
  return {
    listSources: async () => [win, screen],
    stopWindowAudio: vi.fn(),
    startWindowAudio: vi.fn().mockResolvedValue(true),
    watchWindow: vi.fn(),
    stopWatch: vi.fn(),
    warnAudioFallback: vi.fn(),
    log: vi.fn(),
    audioRequested: true,
    platform: 'win32',
    restoreWindow: vi.fn(),
    sleep: vi.fn().mockResolvedValue(undefined),
    ...over
  }
}

describe('shareStreams', () => {
  it('janela: vigia a janela e leva o som só dela', async () => {
    const d = deps()
    expect(await shareStreams(win.id, d)).toEqual({ video: win })
    expect(d.startWindowAudio).toHaveBeenCalledWith('9')
    expect(d.watchWindow).toHaveBeenCalledWith(win.id)
    expect(d.warnAudioFallback).not.toHaveBeenCalled()
  })

  it('janela sem como isolar o som: vai sem som e avisa', async () => {
    const d = deps({ startWindowAudio: vi.fn().mockResolvedValue(false) })
    expect(await shareStreams(win.id, d)).toEqual({ video: win })
    expect(d.warnAudioFallback).toHaveBeenCalled()
  })

  it('tela inteira: som do sistema e para de vigiar janela', async () => {
    const d = deps()
    expect(await shareStreams(screen.id, d)).toEqual({ video: screen, audio: 'loopback' })
    expect(d.startWindowAudio).not.toHaveBeenCalled()
    expect(d.stopWatch).toHaveBeenCalled()
  })

  it('sem som pedido, não captura som de janela', async () => {
    const d = deps({ audioRequested: false })
    expect(await shareStreams(win.id, d)).toEqual({ video: win })
    expect(d.startWindowAudio).not.toHaveBeenCalled()
  })

  // Regressão: jogo em tela cheia se minimiza ao abrir o seletor e não dava para escolhê-lo.
  it('janela minimizada: traz de volta e compartilha quando ela reaparece', async () => {
    const listSources = vi
      .fn()
      .mockResolvedValueOnce([screen])
      .mockResolvedValueOnce([screen])
      .mockResolvedValue([win, screen])
    const d = deps({ listSources })
    expect(await shareStreams(win.id, d)).toEqual({ video: win })
    expect(d.restoreWindow).toHaveBeenCalledWith('9')
    expect(d.startWindowAudio).toHaveBeenCalledWith('9')
  })

  it('janela minimizada que não volta: desiste e recusa', async () => {
    const d = deps({ listSources: async () => [screen] })
    expect(await shareStreams(win.id, d)).toBeNull()
    expect(d.restoreWindow).toHaveBeenCalledTimes(1)
    expect(vi.mocked(d.sleep).mock.calls.length).toBeGreaterThan(1)
    expect(vi.mocked(d.sleep).mock.calls.length).toBeLessThan(100)
  })

  it('tela que sumiu não tenta restaurar nada', async () => {
    const d = deps()
    expect(await shareStreams('screen:9:0', d)).toBeNull()
    expect(d.restoreWindow).not.toHaveBeenCalled()
  })

  it('fonte que sumiu ou erro ao listar: recusa', async () => {
    expect(await shareStreams('window:1:0', deps())).toBeNull()
    const d = deps({ listSources: () => Promise.reject(new Error('x')) })
    expect(await shareStreams(win.id, d)).toBeNull()
    expect(d.log).toHaveBeenCalled()
  })
})
