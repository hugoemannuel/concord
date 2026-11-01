import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ─── Mock do Electron: o atalho de login se comporta como no Windows ───────
// (openAtLogin só bate quando a leitura passa os mesmos args da gravação).
const h = vi.hoisted(() => ({
  state: {
    handlers: {} as Record<string, (...a: unknown[]) => unknown>,
    trayHost: true,
    trays: 0,
    loginItem: null as { openAtLogin: boolean; args: string[] } | null
  }
}))

vi.mock('electron', () => {
  const sameArgs = (a: string[], b: string[]): boolean =>
    a.length === b.length && a.every((x, i) => x === b[i])
  return {
    app: {
      isPackaged: true,
      getPath: () => '/tmp/concord-teste',
      on: vi.fn(),
      setLoginItemSettings: (s: { openAtLogin: boolean; args?: string[] }) => {
        h.state.loginItem = { openAtLogin: s.openAtLogin, args: s.args ?? [] }
      },
      getLoginItemSettings: (o: { args?: string[] } = {}) => {
        const item = h.state.loginItem
        const openAtLogin = !!item && item.openAtLogin && sameArgs(o.args ?? [], item.args)
        return { openAtLogin, launchItems: [] }
      }
    },
    ipcMain: {
      handle: (ch: string, fn: (...a: unknown[]) => unknown) => (h.state.handlers[ch] = fn),
      on: (ch: string, fn: (...a: unknown[]) => unknown) => (h.state.handlers[ch] = fn)
    },
    Menu: { buildFromTemplate: () => ({}) },
    nativeImage: { createFromPath: () => ({}) },
    Notification: class {
      static isSupported = (): boolean => true
    },
    Tray: class {
      constructor() {
        h.state.trays++
      }
      isDestroyed = (): boolean => false
      on = vi.fn()
      setToolTip = vi.fn()
      setContextMenu = vi.fn()
    }
  }
})
vi.mock('./trayHost', () => ({ probeTrayHost: async () => h.state.trayHost }))
vi.mock('fs', () => ({
  existsSync: () => true,
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: () => {
    throw new Error('sem arquivo')
  }
}))

const realPlatform = process.platform

const mainContents = {}
const mainWindow = { webContents: mainContents } as unknown as import('electron').BrowserWindow

async function setup(): Promise<void> {
  const { setupBackground } = await import('./background')
  setupBackground(() => mainWindow, 'icone.png')
}

const invoke = (ch: string, ...args: unknown[]): unknown =>
  h.state.handlers[ch]({ sender: mainContents }, ...args)
const invokeFrom = (sender: unknown, ch: string, ...args: unknown[]): unknown =>
  h.state.handlers[ch]({ sender }, ...args)

beforeEach(() => {
  vi.resetModules()
  Object.defineProperty(process, 'platform', { value: 'win32' })
  h.state.handlers = {}
  h.state.loginItem = null
  h.state.trayHost = true
  h.state.trays = 0
})

afterEach(() => {
  Object.defineProperty(process, 'platform', { value: realPlatform })
})

describe('Iniciar com o Windows', () => {
  it('ligar e reabrir as configurações continua mostrando ligado', async () => {
    await setup()
    await invoke('settings:set-autostart', false)
    expect(await invoke('settings:autostart')).toBe(false)
    await invoke('settings:set-autostart', true)
    expect(await invoke('settings:autostart')).toBe(true)
  })

  it('outra página (não a janela principal) ou valor que não é booleano não mexe no autostart', async () => {
    await setup()
    expect(await invokeFrom({}, 'settings:set-autostart', false)).toBeNull()
    expect(await invoke('settings:set-autostart', 'false')).toBeNull()
    expect(await invoke('settings:autostart')).toBe(true)
  })

  it('primeira execução já vem ligada e a tela de configurações vê isso', async () => {
    await setup()
    expect(await invoke('settings:autostart')).toBe(true)
  })
})

describe('Bandeja no Linux', () => {
  beforeEach(() => {
    Object.defineProperty(process, 'platform', { value: 'linux' })
  })

  it('cria a bandeja no Linux e a opção "minimizar ao fechar" vem ligada', async () => {
    await setup()
    expect(h.state.trays).toBe(1)
    expect(await invoke('settings:close-to-tray')).toEqual({ enabled: true, available: true })
  })

  it('avisa quando o painel não mostra bandeja (sem host StatusNotifier)', async () => {
    h.state.trayHost = false
    await setup()
    expect(await invoke('settings:close-to-tray')).toEqual({ enabled: true, available: false })
  })

  it('desligar e reabrir as configurações continua desligado', async () => {
    await setup()
    expect(await invoke('settings:set-close-to-tray', false)).toBe(false)
    expect(await invoke('settings:close-to-tray')).toEqual({ enabled: false, available: true })
  })

  it('iniciar com o Windows não existe no Linux', async () => {
    await setup()
    expect(await invoke('settings:autostart')).toBeNull()
  })

  it('no Windows não há opção de bandeja (sempre esconde)', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' })
    await setup()
    expect(h.state.trays).toBe(1)
    expect(await invoke('settings:close-to-tray')).toBeNull()
  })

  it('no macOS não cria bandeja', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' })
    await setup()
    expect(h.state.trays).toBe(0)
    expect(await invoke('settings:close-to-tray')).toBeNull()
  })
})
