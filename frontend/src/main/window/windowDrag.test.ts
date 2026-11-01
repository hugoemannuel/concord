import { describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  handlers: {} as Record<string, (...a: unknown[]) => unknown>
}))

vi.mock('electron', () => ({
  ipcMain: {
    on: (ch: string, fn: (...a: unknown[]) => unknown) => (h.handlers[ch] = fn),
    handle: (ch: string, fn: (...a: unknown[]) => unknown) => (h.handlers[ch] = fn)
  }
}))

const { setupWindowDrag } = await import('./windowDrag')

function fakeWindow(overrides: Partial<ReturnType<typeof baseWindow>> = {}) {
  return { ...baseWindow(), ...overrides }
}

function baseWindow() {
  const contents = {}
  return {
    webContents: contents,
    destroyed: false,
    maximized: false,
    position: [100, 50] as [number, number],
    isDestroyed: vi.fn(function (this: ReturnType<typeof baseWindow>) {
      return this.destroyed
    }),
    isMaximized: vi.fn(function (this: ReturnType<typeof baseWindow>) {
      return this.maximized
    }),
    unmaximize: vi.fn(function (this: ReturnType<typeof baseWindow>) {
      this.maximized = false
    }),
    maximize: vi.fn(function (this: ReturnType<typeof baseWindow>) {
      this.maximized = true
    }),
    getPosition: vi.fn(function (this: ReturnType<typeof baseWindow>) {
      return this.position
    }),
    setPosition: vi.fn()
  }
}

describe('setupWindowDrag', () => {
  it('aplica a posição mandada pelo renderer, mesmo fora dos limites do monitor principal', () => {
    const win = fakeWindow()
    h.handlers = {}
    setupWindowDrag(() => win as never)

    // Monitor principal até x=1920; a janela vai para o segundo monitor.
    h.handlers['window:drag-move']({ sender: win.webContents }, { x: 2300, y: 100 })

    expect(win.setPosition).toHaveBeenCalledWith(2300, 100)
  })

  it('ignora mensagem de outra janela ou payload inválido', () => {
    const win = fakeWindow()
    h.handlers = {}
    setupWindowDrag(() => win as never)

    h.handlers['window:drag-move']({ sender: {} }, { x: 10, y: 10 })
    h.handlers['window:drag-move']({ sender: win.webContents }, { x: '10', y: 10 })

    expect(win.setPosition).not.toHaveBeenCalled()
  })

  it('início do arraste só informa a posição e se está maximizada — não restaura sozinho', () => {
    const win = fakeWindow({ maximized: true })
    h.handlers = {}
    setupWindowDrag(() => win as never)

    const result = h.handlers['window:drag-start']({ sender: win.webContents })

    expect(win.unmaximize).not.toHaveBeenCalled()
    expect(result).toEqual({ x: 100, y: 50, maximized: true })
  })

  it('restaurar para arrastar desmaximiza e devolve a posição', () => {
    const win = fakeWindow({ maximized: true })
    h.handlers = {}
    setupWindowDrag(() => win as never)

    const result = h.handlers['window:drag-restore']({ sender: win.webContents })

    expect(win.unmaximize).toHaveBeenCalled()
    expect(result).toEqual({ x: 100, y: 50 })
  })

  it('duplo clique alterna maximizar/restaurar', () => {
    const win = fakeWindow()
    h.handlers = {}
    setupWindowDrag(() => win as never)

    h.handlers['window:drag-toggle-maximize']({ sender: win.webContents })
    expect(win.maximize).toHaveBeenCalled()

    h.handlers['window:drag-toggle-maximize']({ sender: win.webContents })
    expect(win.unmaximize).toHaveBeenCalled()
  })

  it('sem janela, destruída ou de outra origem: nenhum canal faz nada', () => {
    const win = fakeWindow({ destroyed: true })
    h.handlers = {}
    setupWindowDrag(() => win as never)

    expect(h.handlers['window:drag-start']({ sender: win.webContents })).toBeNull()
    expect(h.handlers['window:drag-restore']({ sender: win.webContents })).toBeNull()

    const win2 = fakeWindow()
    h.handlers = {}
    setupWindowDrag(() => null)
    expect(h.handlers['window:drag-start']({ sender: win2.webContents })).toBeNull()
  })
})
