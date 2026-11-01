import { describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  handlers: {} as Record<string, (...a: unknown[]) => unknown>
}))

vi.mock('electron', () => ({
  ipcMain: {
    on: (ch: string, fn: (...a: unknown[]) => unknown) => (h.handlers[ch] = fn)
  }
}))

const { registerThemeHandlers } = await import('./windowTheme')

const COLORS = { color: '#101010', symbolColor: '#eeeeee' }

function setup(platform: NodeJS.Platform = 'win32', overlayThrows = false) {
  const win = {
    webContents: {},
    setBackgroundColor: vi.fn(),
    setTitleBarOverlay: vi.fn(() => {
      if (overlayThrows) throw new Error('sem overlay')
    })
  }
  registerThemeHandlers(() => win as never, platform)
  const send = (sender: unknown, raw: unknown): void =>
    void h.handlers['window:title-bar-colors']({ sender }, raw)
  return { win, send }
}

describe('registerThemeHandlers', () => {
  it('pinta o fundo e a barra nativa com as cores do tema', () => {
    const { win, send } = setup()
    send(win.webContents, COLORS)
    expect(win.setBackgroundColor).toHaveBeenCalledWith('#101010')
    expect(win.setTitleBarOverlay).toHaveBeenCalledWith(expect.objectContaining(COLORS))
  })

  it('ignora quem não é a janela principal', () => {
    const { win, send } = setup()
    send({}, COLORS)
    expect(win.setBackgroundColor).not.toHaveBeenCalled()
  })

  it('ignora cores inválidas', () => {
    const { win, send } = setup()
    send(win.webContents, { color: 'red;', symbolColor: 1 })
    expect(win.setBackgroundColor).not.toHaveBeenCalled()
  })

  it('no macOS não mexe no overlay da barra', () => {
    const { win, send } = setup('darwin')
    send(win.webContents, COLORS)
    expect(win.setTitleBarOverlay).not.toHaveBeenCalled()
  })

  it('sem overlay nativo, não quebra', () => {
    const { win, send } = setup('linux', true)
    expect(() => send(win.webContents, COLORS)).not.toThrow()
    expect(win.setBackgroundColor).toHaveBeenCalled()
  })

  it('sem janela, não faz nada', () => {
    registerThemeHandlers(() => null, 'win32')
    expect(() => h.handlers['window:title-bar-colors']({ sender: {} }, COLORS)).not.toThrow()
  })
})
