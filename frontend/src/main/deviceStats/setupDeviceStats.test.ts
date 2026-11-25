import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowserWindow } from 'electron'

type Listener = (...args: unknown[]) => void

const electron = vi.hoisted(() => {
  const appListeners = new Map<string, Listener>()
  const powerListeners = new Map<string, Listener>()
  return {
    appListeners,
    powerListeners,
    handle: vi.fn(),
    on: vi.fn(),
    app: {
      on: vi.fn((name: string, fn: Listener) => appListeners.set(name, fn)),
      getAppMetrics: vi.fn(() => []),
      getGPUFeatureStatus: vi.fn(() => ({ gpu_compositing: 'enabled' })),
      isHardwareAccelerationEnabled: vi.fn(() => true)
    },
    powerMonitor: {
      on: vi.fn((name: string, fn: Listener) => powerListeners.set(name, fn)),
      isOnBatteryPower: vi.fn(() => false)
    }
  }
})
vi.mock('electron', () => ({
  app: electron.app,
  powerMonitor: electron.powerMonitor,
  ipcMain: { handle: electron.handle, on: electron.on }
}))

import { fromMainFrame, isGpuCrash, setupDeviceStats } from './setupDeviceStats'

beforeEach(() => {
  // O timer de 15 s liga na primeira take: relógio falso para não vazar.
  vi.useFakeTimers()
  vi.clearAllMocks()
  electron.appListeners.clear()
  electron.powerListeners.clear()
})

function fakeWindow() {
  const listeners = new Map<string, Listener>()
  const webContents = { mainFrame: {} }
  const win = {
    isDestroyed: () => false,
    webContents,
    on: (name: string, fn: Listener) => listeners.set(name, fn)
  }
  return { win, webContents, emit: (name: string) => listeners.get(name)?.() }
}

const handler = (channel: string): Listener =>
  electron.handle.mock.calls.find(([name]) => name === channel)?.[1]
const sender = (channel: string): Listener =>
  electron.on.mock.calls.find(([name]) => name === channel)?.[1]

describe('isGpuCrash', () => {
  it('só a GPU que saiu sem ser por clean-exit', () => {
    expect(isGpuCrash({ type: 'GPU', reason: 'crashed' })).toBe(true)
    expect(isGpuCrash({ type: 'GPU', reason: 'clean-exit' })).toBe(false)
    expect(isGpuCrash({ type: 'Utility', reason: 'crashed' })).toBe(false)
  })
})

describe('fromMainFrame', () => {
  it('confere janela, webContents e o quadro principal', () => {
    const { win, webContents } = fakeWindow()
    expect(fromMainFrame({ sender: webContents, senderFrame: webContents.mainFrame }, win)).toBe(
      true
    )
    expect(fromMainFrame({ sender: {}, senderFrame: webContents.mainFrame }, win)).toBe(false)
    expect(fromMainFrame({ sender: webContents, senderFrame: {} }, win)).toBe(false)
    expect(fromMainFrame({ sender: webContents, senderFrame: {} }, null)).toBe(false)
    const destroyed = { ...win, isDestroyed: () => true }
    expect(
      fromMainFrame({ sender: webContents, senderFrame: webContents.mainFrame }, destroyed)
    ).toBe(false)
  })
})

describe('setupDeviceStats', () => {
  it('take só responde ao quadro principal da janela principal', () => {
    const { win, webContents } = fakeWindow()
    setupDeviceStats(() => win as unknown as BrowserWindow)
    const take = handler('device-stats:take')
    expect(take({ sender: {}, senderFrame: webContents.mainFrame })).toBeNull()
    const result = take({ sender: webContents, senderFrame: webContents.mainFrame })
    expect(result).toMatchObject({ seconds: 0, hangs: 0, gpuStatus: 'enabled' })
  })

  it('conta só a travada da janela principal e a GPU que caiu', () => {
    const main = fakeWindow()
    const other = fakeWindow()
    setupDeviceStats(() => main.win as unknown as BrowserWindow)
    const created = electron.appListeners.get('browser-window-created') as Listener
    created({}, main.win)
    created({}, other.win)
    main.emit('unresponsive')
    other.emit('unresponsive')
    electron.appListeners.get('child-process-gone')?.({}, { type: 'GPU', reason: 'oom' })
    electron.powerListeners.get('speed-limit-change')?.({ limit: 60 })
    const ok = { sender: main.webContents, senderFrame: main.webContents.mainFrame }
    expect(handler('device-stats:take')(ok)).toMatchObject({
      hangs: 1,
      gpuCrashes: 1,
      sys: { speedLimitPct: 60 }
    })
  })

  it('usable marca a abertura só vindo da janela principal', () => {
    const { win, webContents } = fakeWindow()
    setupDeviceStats(() => win as unknown as BrowserWindow)
    sender('device-stats:usable')({ sender: {}, senderFrame: webContents.mainFrame })
    const ok = { sender: webContents, senderFrame: webContents.mainFrame }
    expect(handler('device-stats:take')(ok)).toMatchObject({ startupMs: null })
    sender('device-stats:usable')(ok)
    expect(handler('device-stats:take')(ok)).toMatchObject({ startupMs: expect.any(Number) })
  })
})
