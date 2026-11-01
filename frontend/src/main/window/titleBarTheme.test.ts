import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  handler: null as null | ((event: unknown, raw: unknown) => void)
}))

vi.mock('electron', () => ({
  ipcMain: {
    on: (_channel: string, fn: (event: unknown, raw: unknown) => void) => (h.handler = fn)
  }
}))
vi.mock('../splash/splashMarks', () => ({ saveSplashColors: vi.fn() }))

import { saveSplashColors } from '../splash/splashMarks'
import { registerThemeHandlers } from './titleBarTheme'

const colors = { color: '#ffffff', symbolColor: '#333333' }
const realPlatform = process.platform

function fakeWindow(): {
  webContents: object
  setBackgroundColor: ReturnType<typeof vi.fn>
  setTitleBarOverlay: ReturnType<typeof vi.fn>
} {
  return { webContents: {}, setBackgroundColor: vi.fn(), setTitleBarOverlay: vi.fn() }
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(process, 'platform', { value: 'win32' })
})

afterEach(() => {
  Object.defineProperty(process, 'platform', { value: realPlatform })
})

describe('registerThemeHandlers', () => {
  it('pinta a janela, a barra nativa e guarda as cores para a janelinha de abertura', () => {
    const win = fakeWindow()
    registerThemeHandlers(() => win as never)
    h.handler?.({ sender: win.webContents }, colors)
    expect(win.setBackgroundColor).toHaveBeenCalledWith('#ffffff')
    expect(win.setTitleBarOverlay).toHaveBeenCalledWith(expect.objectContaining(colors))
    expect(saveSplashColors).toHaveBeenCalledWith(colors)
  })

  it('ignora outra página e cores inválidas', () => {
    const win = fakeWindow()
    registerThemeHandlers(() => win as never)
    h.handler?.({ sender: {} }, colors)
    h.handler?.({ sender: win.webContents }, { color: 'red', symbolColor: '#000000' })
    expect(win.setBackgroundColor).not.toHaveBeenCalled()
    expect(saveSplashColors).not.toHaveBeenCalled()
  })

  it('sem janela: nada', () => {
    registerThemeHandlers(() => null)
    expect(() => h.handler?.({ sender: {} }, colors)).not.toThrow()
  })

  it('macOS: só o fundo (a barra nativa já combina)', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' })
    const win = fakeWindow()
    registerThemeHandlers(() => win as never)
    h.handler?.({ sender: win.webContents }, colors)
    expect(win.setTitleBarOverlay).not.toHaveBeenCalled()
  })

  it('sem overlay nativo: não quebra', () => {
    const win = fakeWindow()
    win.setTitleBarOverlay.mockImplementation(() => {
      throw new Error('sem overlay')
    })
    registerThemeHandlers(() => win as never)
    expect(() => h.handler?.({ sender: win.webContents }, colors)).not.toThrow()
  })
})
