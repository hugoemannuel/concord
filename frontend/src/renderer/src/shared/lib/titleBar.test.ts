import { afterEach, describe, expect, it } from 'vitest'
import { currentPlatform, hasCustomTitleBar } from './titleBar'

describe('hasCustomTitleBar', () => {
  it('Windows e Linux desenham a barra; macOS e navegador não', () => {
    expect(hasCustomTitleBar('win32')).toBe(true)
    expect(hasCustomTitleBar('linux')).toBe(true)
    expect(hasCustomTitleBar('darwin')).toBe(false)
    expect(hasCustomTitleBar(undefined)).toBe(false)
  })
})

describe('currentPlatform', () => {
  const originalWindow = globalThis.window

  afterEach(() => {
    Object.defineProperty(globalThis, 'window', {
      value: originalWindow,
      configurable: true,
      writable: true
    })
  })

  it('lê a plataforma exposta pela ponte do preload (window.api.platform)', () => {
    Object.defineProperty(globalThis, 'window', {
      value: { api: { platform: 'win32' } },
      configurable: true,
      writable: true
    })
    expect(currentPlatform()).toBe('win32')
    expect(hasCustomTitleBar(currentPlatform())).toBe(true)
  })

  it('retorna undefined no navegador (sem window.api) ou fora do DOM', () => {
    Object.defineProperty(globalThis, 'window', {
      value: {},
      configurable: true,
      writable: true
    })
    expect(currentPlatform()).toBeUndefined()

    Object.defineProperty(globalThis, 'window', {
      value: undefined,
      configurable: true,
      writable: true
    })
    expect(currentPlatform()).toBeUndefined()
  })
})
