import { describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  handlers: {} as Record<string, (...a: unknown[]) => unknown>,
  windows: new Map<unknown, { setContentProtection: (on: boolean) => void }>()
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (ch: string, fn: (...a: unknown[]) => unknown) => (h.handlers[ch] = fn)
  },
  BrowserWindow: { fromWebContents: (wc: unknown) => h.windows.get(wc) ?? null }
}))

const { registerContentProtection } = await import('./contentProtection')

function setup() {
  const sender = {}
  const win = { setContentProtection: vi.fn() }
  h.windows.clear()
  h.windows.set(sender, win)
  registerContentProtection()
  return { sender, win, call: (on: unknown) => h.handlers['window:content-protection']({ sender }, on) }
}

describe('registerContentProtection', () => {
  it('true liga a proteção na janela de quem pediu', () => {
    const { win, call } = setup()
    call(true)
    expect(win.setContentProtection).toHaveBeenCalledWith(true)
  })

  it('false desliga', () => {
    const { win, call } = setup()
    call(false)
    expect(win.setContentProtection).toHaveBeenCalledWith(false)
  })

  it.each(['true', 1, null, undefined, {}])('valor que não é boolean (%s) vira false', (raw) => {
    const { win, call } = setup()
    call(raw)
    expect(win.setContentProtection).toHaveBeenCalledWith(false)
  })

  it('sem janela para o sender, não faz nada', () => {
    setup()
    expect(() => h.handlers['window:content-protection']({ sender: {} }, true)).not.toThrow()
  })
})
