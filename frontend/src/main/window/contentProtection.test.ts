import type { BrowserWindow } from 'electron'
import { describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  handlers: {} as Record<string, (...a: unknown[]) => unknown>
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (ch: string, fn: (...a: unknown[]) => unknown) => (h.handlers[ch] = fn)
  }
}))

const { registerContentProtection } = await import('./contentProtection')

function setup(destroyed = false) {
  const win = {
    webContents: {},
    isDestroyed: vi.fn(() => destroyed),
    setContentProtection: vi.fn()
  }
  registerContentProtection(() => win as unknown as BrowserWindow)
  const call = (on: unknown, sender: unknown = win.webContents) =>
    h.handlers['window:content-protection']({ sender }, on)
  return { win, call }
}

describe('registerContentProtection', () => {
  it('true liga a proteção na janela principal', () => {
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

  it('sender que não é a janela principal (overlay): não faz nada', () => {
    const { win, call } = setup()
    call(true, {})
    expect(win.setContentProtection).not.toHaveBeenCalled()
  })

  it('janela destruída: não faz nada', () => {
    const { win, call } = setup(true)
    call(true)
    expect(win.setContentProtection).not.toHaveBeenCalled()
  })

  it('sem janela principal: não faz nada', () => {
    registerContentProtection(() => null)
    expect(() => h.handlers['window:content-protection']({ sender: {} }, true)).not.toThrow()
  })
})
