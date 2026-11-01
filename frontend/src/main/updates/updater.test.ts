import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ─── Mocks do Electron / electron-updater (estado compartilhado por teste) ──
const h = vi.hoisted(() => {
  const listeners: Record<string, Array<(...a: unknown[]) => unknown>> = {}
  const state = {
    inCall: false,
    validSignature: true,
    handlers: {} as Record<string, (...a: unknown[]) => unknown>,
    sent: [] as Array<[string, unknown]>,
    files: {} as Record<string, string>
  }
  const autoUpdater = {
    autoDownload: true,
    autoInstallOnAppQuit: true,
    setFeedURL: vi.fn(),
    checkForUpdates: vi.fn(async () => null),
    downloadUpdate: vi.fn(async () => []),
    quitAndInstall: vi.fn(),
    on: (event: string, fn: (...a: unknown[]) => unknown) => {
      ;(listeners[event] ??= []).push(fn)
    },
    emit: async (event: string, ...args: unknown[]) => {
      for (const fn of listeners[event] ?? []) await fn(...args)
    },
    reset: () => {
      for (const k of Object.keys(listeners)) delete listeners[k]
    }
  }
  const fetch = vi.fn<(url?: string) => Promise<{ ok: boolean; text: () => Promise<string> }>>(
    async () => ({ ok: true, text: async () => 'assinatura' })
  )
  const rm = vi.fn(async (path: string) => {
    delete state.files[path]
  })
  // Updater próprio do Linux (linuxUpdater.ts): mesmo formato + stage.
  const linuxListeners: Record<string, Array<(...a: unknown[]) => unknown>> = {}
  const linux = {
    kind: 'electron-updater' as 'electron-updater' | 'linux-managed',
    options: null as null | Record<string, unknown>,
    checkForUpdates: vi.fn(async () => null),
    downloadUpdate: vi.fn(async () => ''),
    quitAndInstall: vi.fn(),
    stage: vi.fn<(event?: unknown, data?: Buffer) => Promise<void>>(async () => {}),
    canAutoInstall: vi.fn<(version?: string) => boolean>(() => true),
    confirmStartup: vi.fn(),
    on: (event: string, fn: (...a: unknown[]) => unknown) => {
      ;(linuxListeners[event] ??= []).push(fn)
    },
    emit: async (event: string, ...args: unknown[]) => {
      for (const fn of linuxListeners[event] ?? []) await fn(...args)
    },
    reset: () => {
      for (const k of Object.keys(linuxListeners)) delete linuxListeners[k]
      linux.kind = 'electron-updater'
      linux.options = null
    }
  }
  return { state, autoUpdater, fetch, linux, rm }
})

vi.mock('electron', () => ({
  app: {
    isPackaged: true,
    getPath: () => '/tmp/concord-teste',
    getVersion: () => '0.6.0',
    relaunch: vi.fn(),
    quit: vi.fn()
  },
  ipcMain: {
    handle: (ch: string, fn: (...a: unknown[]) => unknown) => (h.state.handlers[ch] = fn),
    on: (ch: string, fn: (...a: unknown[]) => unknown) => (h.state.handlers[ch] = fn)
  },
  net: { fetch: h.fetch }
}))
vi.mock('electron-updater', () => ({ autoUpdater: h.autoUpdater }))
vi.mock('./linuxInstall', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./linuxInstall')>()),
  updateBackendKind: () => h.linux.kind
}))
vi.mock('./linuxUpdater', () => ({
  LinuxUpdater: class {
    constructor(options: Record<string, unknown>) {
      h.linux.options = options
      return h.linux
    }
  }
}))
// userData em memória: sobrevive a "reiniciar" o updater (vi.resetModules).
vi.mock('fs/promises', () => ({
  readFile: async () => Buffer.from('instalador'),
  rm: h.rm,
  rename: async () => {},
  stat: async () => ({ size: 0 }),
  writeFile: async (path: string, data: string) => {
    h.state.files[path] = data
  }
}))
vi.mock('fs', () => ({
  readFileSync: (path: string) => {
    if (!(path in h.state.files)) throw new Error('sem arquivo')
    return h.state.files[path]
  },
  realpathSync: (path: string) => path
}))
vi.mock('../window/background', () => ({
  isInCall: () => h.state.inCall,
  markQuitting: vi.fn()
}))
vi.mock('../app/appLog', () => ({ appendLog: vi.fn(), logPath: (n: string) => `/logs/${n}` }))
vi.mock('./updateSignature', () => ({ verifyInstaller: () => h.state.validSignature }))
vi.mock('./callResume', () => ({
  takeCallResume: vi.fn(() => null),
  saveCallResume: vi.fn(),
  clearCallResume: vi.fn()
}))

const win = { webContents: { send: (ch: string, v: unknown) => h.state.sent.push([ch, v]) } }

async function startUpdater(): Promise<void> {
  const { setupUpdater } = await import('./updater')
  setupUpdater(() => win as never, { feedUrl: 'http://srv/updates/', publicKeyPem: 'chave' })
}

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers({ toFake: ['setInterval'] })
  h.autoUpdater.reset()
  h.linux.reset()
  vi.clearAllMocks()
  h.state.inCall = false
  h.state.validSignature = true
  h.state.handlers = {}
  h.state.sent = []
  h.state.files = {}
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

// O código só registra em update.log/avisa do sandbox no Linux; força a
// plataforma nos blocos que testam isso (senão falham ao rodar no Windows).
const realPlatform = process.platform
function forceLinux(): void {
  beforeEach(() => {
    Object.defineProperty(process, 'platform', { value: 'linux' })
  })
  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: realPlatform })
  })
}

describe('updater', () => {
  it('entrega a retomada uma única vez e somente à janela principal', async () => {
    const { takeCallResume } = await import('./callResume')
    const pending = {
      userId: 'u',
      backendUrl: 'api',
      serverId: 's',
      channelId: 'c',
      muted: false,
      deafened: false,
      mutedBeforeDeafen: false,
      savedAt: Date.now()
    }
    vi.mocked(takeCallResume).mockReturnValueOnce(pending)
    await startUpdater()
    expect(h.state.handlers['update:take-call-resume']({ sender: {} })).toBeNull()
    expect(h.state.handlers['update:take-call-resume']({ sender: win.webContents })).toEqual(
      pending
    )
    expect(h.state.handlers['update:take-call-resume']({ sender: win.webContents })).toBeNull()
  })

  it('não instala quando falha ao gravar a retomada', async () => {
    await startUpdater()
    const { saveCallResume } = await import('./callResume')
    vi.mocked(saveCallResume).mockImplementationOnce(() => {
      throw new Error('disk full')
    })
    await h.autoUpdater.emit('update-available', { version: '0.6.1' })
    await h.autoUpdater.emit('update-downloaded', { version: '0.6.1', downloadedFile: 'setup.exe' })
    h.state.handlers['update:install']({ sender: win.webContents })
    expect(h.autoUpdater.quitAndInstall).not.toHaveBeenCalled()
    expect(h.state.sent.some(([channel]) => channel === 'update:error')).toBe(true)
  })

  it('instalar pedido por outra página (não a janela principal) é ignorado', async () => {
    await startUpdater()
    await h.autoUpdater.emit('update-available', { version: '0.6.1' })
    await h.autoUpdater.emit('update-downloaded', { version: '0.6.1', downloadedFile: 'setup.exe' })
    h.state.handlers['update:install']({ sender: {} })
    expect(h.autoUpdater.quitAndInstall).not.toHaveBeenCalled()
  })

  it('verifica a assinatura do AppImage pelo nome no cache antes de instalar', async () => {
    await startUpdater()
    await h.autoUpdater.emit('update-available', { version: '0.7.0' })
    await h.autoUpdater.emit('update-downloaded', {
      version: '0.7.0',
      downloadedFile: '/home/user/.cache/salinha-updater/pending/Salinha-0.7.0-x64.AppImage'
    })
    expect(h.fetch).toHaveBeenCalledWith('http://srv/updates/Salinha-0.7.0-x64.AppImage.sig')
    expect(h.state.sent).toContainEqual(['update:ready', '0.7.0'])
    h.state.handlers['update:install']({ sender: win.webContents })
    expect(h.autoUpdater.quitAndInstall).toHaveBeenCalledWith(true, true)
  })

  it('recusa AppImage com assinatura inválida', async () => {
    h.state.validSignature = false
    await startUpdater()
    await h.autoUpdater.emit('update-available', { version: '0.7.0' })
    h.state.handlers['update:install']({ sender: win.webContents })
    await h.autoUpdater.emit('update-downloaded', {
      version: '0.7.0',
      downloadedFile: '/cache/Salinha-0.7.0-x64.AppImage'
    })
    expect(h.autoUpdater.quitAndInstall).not.toHaveBeenCalled()
    expect(h.state.sent.some(([channel]) => channel === 'update:error')).toBe(true)
  })

  it('limpa a retomada quando o instalador falha', async () => {
    await startUpdater()
    const { clearCallResume } = await import('./callResume')
    await h.autoUpdater.emit('update-available', { version: '0.6.1' })
    await h.autoUpdater.emit('update-downloaded', { version: '0.6.1', downloadedFile: 'setup.exe' })
    h.state.handlers['update:install']({ sender: win.webContents })
    await h.autoUpdater.emit('error', new Error('installer failed'))
    expect(clearCallResume).toHaveBeenCalled()
  })

  it('salva o estado mais recente antes de instalar e ignora IPC de outra janela', async () => {
    await startUpdater()
    const { saveCallResume } = await import('./callResume')
    const snapshot = {
      userId: 'u',
      backendUrl: 'api',
      serverId: 's',
      channelId: 'c',
      muted: true,
      deafened: false,
      mutedBeforeDeafen: false
    }
    await h.autoUpdater.emit('update-available', { version: '0.6.1' })
    await h.autoUpdater.emit('update-downloaded', {
      version: '0.6.1',
      downloadedFile: 'setup.exe'
    })
    expect(saveCallResume).not.toHaveBeenCalled()
    h.state.handlers['update:call-snapshot']({ sender: win.webContents }, snapshot)
    h.state.handlers['update:call-snapshot']({ sender: {} }, null)
    h.state.handlers['update:install']({ sender: win.webContents })
    expect(saveCallResume).toHaveBeenCalledWith(snapshot)
    expect(vi.mocked(saveCallResume).mock.invocationCallOrder[0]).toBeLessThan(
      h.autoUpdater.quitAndInstall.mock.invocationCallOrder[0]
    )
  })

  it('recusa AppImage se a assinatura não estiver publicada', async () => {
    h.fetch.mockResolvedValueOnce({ ok: false, text: async () => '' })
    await startUpdater()
    await h.autoUpdater.emit('update-available', { version: '0.7.0' })
    await h.autoUpdater.emit('update-downloaded', {
      version: '0.7.0',
      downloadedFile: '/cache/Salinha-0.7.0-x64.AppImage'
    })
    expect(h.autoUpdater.quitAndInstall).not.toHaveBeenCalled()
    expect(h.state.sent.some(([channel]) => channel === 'update:error')).toBe(true)
  })

  it('em chamada avisa e já baixa em segundo plano, sem clique', async () => {
    h.state.inCall = true
    await startUpdater()

    await h.autoUpdater.emit('update-available', { version: '0.6.0' })

    expect(h.state.sent).toContainEqual(['update:available', '0.6.0'])
    expect(h.autoUpdater.downloadUpdate).toHaveBeenCalledTimes(1)
    expect(h.autoUpdater.quitAndInstall).not.toHaveBeenCalled()
  })

  it('clicar Atualizar antes do fim do download instala assim que terminar, sem baixar de novo', async () => {
    h.state.inCall = true
    await startUpdater()
    await h.autoUpdater.emit('update-available', { version: '0.6.0' })

    h.state.handlers['update:install']({ sender: win.webContents })
    expect(h.autoUpdater.downloadUpdate).toHaveBeenCalledTimes(1)
    expect(h.autoUpdater.quitAndInstall).not.toHaveBeenCalled()

    await h.autoUpdater.emit('update-downloaded', {
      version: '0.6.0',
      downloadedFile: 'C:/x/setup.exe'
    })
    await flush()
    expect(h.autoUpdater.quitAndInstall).toHaveBeenCalledWith(true, true)
    expect(h.autoUpdater.downloadUpdate).toHaveBeenCalledTimes(1)
  })

  it('pronta em chamada: o clique instala na hora, sem novo download', async () => {
    h.state.inCall = true
    await startUpdater()
    await h.autoUpdater.emit('update-available', { version: '0.6.0' })
    await h.autoUpdater.emit('update-downloaded', {
      version: '0.6.0',
      downloadedFile: 'C:/x/setup.exe'
    })
    await flush()
    expect(h.state.sent).toContainEqual(['update:ready', '0.6.0'])
    expect(h.autoUpdater.quitAndInstall).not.toHaveBeenCalled()

    h.state.handlers['update:install']({ sender: win.webContents })
    expect(h.autoUpdater.quitAndInstall).toHaveBeenCalledWith(true, true)
    expect(h.autoUpdater.downloadUpdate).toHaveBeenCalledTimes(1)
  })

  it('download de uma versão já substituída não fica pronto: baixa a mais nova', async () => {
    await startUpdater()
    await h.autoUpdater.emit('update-available', { version: '0.6.1' })
    // Versão mais nova publicada no meio do download.
    await h.autoUpdater.emit('update-available', { version: '0.6.2' })
    expect(h.autoUpdater.downloadUpdate).toHaveBeenCalledTimes(1)

    await h.autoUpdater.emit('update-downloaded', { version: '0.6.1', downloadedFile: 'a.exe' })
    await flush()
    expect(h.state.sent).not.toContainEqual(['update:ready', '0.6.1'])
    expect(h.autoUpdater.downloadUpdate).toHaveBeenCalledTimes(2)

    await h.autoUpdater.emit('update-downloaded', { version: '0.6.2', downloadedFile: 'b.exe' })
    await flush()
    expect(h.state.sent).toContainEqual(['update:ready', '0.6.2'])
  })

  it('download que falha em segundo plano: a barra volta para "disponível" e espera para tentar de novo', async () => {
    vi.useRealTimers()
    vi.useFakeTimers({ toFake: ['setInterval', 'setTimeout', 'Date'] })
    vi.spyOn(Math, 'random').mockReturnValue(0)
    h.autoUpdater.downloadUpdate.mockRejectedValueOnce(new Error('rede caiu'))
    await startUpdater()
    await h.autoUpdater.emit('update-available', { version: '0.7.0' })
    await vi.advanceTimersByTimeAsync(0)
    expect(h.state.sent).toContainEqual(['update:progress', 0])

    // Checagem seguinte dentro da espera de 1 min: não baixa.
    await h.autoUpdater.emit('update-available', { version: '0.7.0' })
    expect(h.autoUpdater.downloadUpdate).toHaveBeenCalledTimes(1)

    vi.setSystemTime(Date.now() + 61_000)
    await h.autoUpdater.emit('update-available', { version: '0.7.0' })
    expect(h.autoUpdater.downloadUpdate).toHaveBeenCalledTimes(2)
    vi.mocked(Math.random).mockRestore()
  })

  it('fora de chamada já baixa em segundo plano; clicar instala na hora', async () => {
    await startUpdater()
    await h.autoUpdater.emit('update-available', { version: '0.6.0' })
    expect(h.autoUpdater.downloadUpdate).toHaveBeenCalled()

    await h.autoUpdater.emit('update-downloaded', {
      version: '0.6.0',
      downloadedFile: 'C:/x/setup.exe'
    })
    await flush()
    expect(h.state.sent).toContainEqual(['update:ready', '0.6.0'])
    expect(h.autoUpdater.quitAndInstall).not.toHaveBeenCalled()

    h.state.handlers['update:install']({ sender: win.webContents })
    expect(h.autoUpdater.quitAndInstall).toHaveBeenCalled()
  })

  it('versão mais nova substitui a que já estava baixada', async () => {
    await startUpdater()
    await h.autoUpdater.emit('update-available', { version: '0.6.0' })
    await h.autoUpdater.emit('update-downloaded', {
      version: '0.6.0',
      downloadedFile: 'C:/x/a.exe'
    })
    await flush()
    h.autoUpdater.downloadUpdate.mockClear()

    await h.autoUpdater.emit('update-available', { version: '0.6.1' })

    expect(h.state.sent).toContainEqual(['update:available', '0.6.1'])
    expect(h.autoUpdater.downloadUpdate).toHaveBeenCalled()
    expect(await h.state.handlers['update:status']()).toEqual({ version: '0.6.1', ready: false })
  })

  it('assinatura inválida nunca instala, mesmo depois de clicar Atualizar', async () => {
    h.state.validSignature = false
    await startUpdater()
    await h.autoUpdater.emit('update-available', { version: '0.6.0' })
    h.state.handlers['update:install']({ sender: win.webContents })

    await h.autoUpdater.emit('update-downloaded', {
      version: '0.6.0',
      downloadedFile: 'C:/x/setup.exe'
    })
    await flush()

    expect(h.autoUpdater.quitAndInstall).not.toHaveBeenCalled()
    expect(h.state.sent.some(([ch]) => ch === 'update:error')).toBe(true)
  })

  it('checa de novo a cada minuto com o app aberto', async () => {
    await startUpdater()
    expect(h.autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1)
    await flush()
    vi.advanceTimersByTime(60_000)
    expect(h.autoUpdater.checkForUpdates).toHaveBeenCalledTimes(2)
  })

  it('o renderer pede checagem na hora (aviso do servidor / WS reconectou)', async () => {
    vi.useRealTimers()
    vi.useFakeTimers({ toFake: ['setInterval', 'setTimeout'] })
    await startUpdater()
    await vi.advanceTimersByTimeAsync(0)
    expect(h.autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1)

    h.state.handlers['update:check-now']({ sender: win.webContents })
    h.state.handlers['update:check-now']({ sender: win.webContents })
    vi.advanceTimersByTime(1000)
    expect(h.autoUpdater.checkForUpdates).toHaveBeenCalledTimes(2)
  })

  it('ignora pedido de checagem de outra janela', async () => {
    vi.useRealTimers()
    vi.useFakeTimers({ toFake: ['setInterval', 'setTimeout'] })
    await startUpdater()
    await vi.advanceTimersByTimeAsync(0)
    h.state.handlers['update:check-now']({ sender: {} })
    vi.advanceTimersByTime(1000)
    expect(h.autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1)
  })

  it('pedido com uma checagem em andamento não faz nada', async () => {
    vi.useRealTimers()
    vi.useFakeTimers({ toFake: ['setInterval', 'setTimeout'] })
    h.autoUpdater.checkForUpdates.mockImplementationOnce(() => new Promise(() => {}))
    await startUpdater()
    h.state.handlers['update:check-now']({ sender: win.webContents })
    vi.advanceTimersByTime(1000)
    expect(h.autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1)
  })

  it('aviso do servidor em chamada já baixa em segundo plano', async () => {
    vi.useRealTimers()
    vi.useFakeTimers({ toFake: ['setInterval', 'setTimeout'] })
    h.state.inCall = true
    await startUpdater()
    await vi.advanceTimersByTimeAsync(0)
    h.state.handlers['update:check-now']({ sender: win.webContents })
    vi.advanceTimersByTime(1000)
    await h.autoUpdater.emit('update-available', { version: '0.7.0' })
    expect(h.state.sent).toContainEqual(['update:available', '0.7.0'])
    expect(h.autoUpdater.downloadUpdate).toHaveBeenCalledTimes(1)
  })

  describe('download em segundo plano espalhado (aviso do servidor / checagem periódica)', () => {
    beforeEach(() => {
      vi.useRealTimers()
      vi.useFakeTimers({ toFake: ['setInterval', 'setTimeout', 'Date'] })
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
    })

    afterEach(() => {
      vi.mocked(Math.random).mockRestore()
    })

    /** Abre o app e deixa passar a janela de início (download sem espera). */
    async function startAndWait(): Promise<void> {
      await startUpdater()
      await vi.advanceTimersByTimeAsync(0)
      vi.setSystemTime(Date.now() + 5 * 60_000)
    }

    it('o aviso aparece na hora e o download espera o sorteio', async () => {
      await startAndWait()
      await h.autoUpdater.emit('update-available', { version: '0.7.0' })

      expect(h.state.sent).toContainEqual(['update:available', '0.7.0'])
      expect(h.autoUpdater.downloadUpdate).not.toHaveBeenCalled()
      vi.advanceTimersByTime(59_999)
      expect(h.autoUpdater.downloadUpdate).not.toHaveBeenCalled()
      vi.advanceTimersByTime(1)
      expect(h.autoUpdater.downloadUpdate).toHaveBeenCalledTimes(1)
    })

    it('clicar em Atualizar durante a espera baixa na hora, uma vez só', async () => {
      await startAndWait()
      await h.autoUpdater.emit('update-available', { version: '0.7.0' })

      h.state.handlers['update:install']({ sender: win.webContents })
      expect(h.autoUpdater.downloadUpdate).toHaveBeenCalledTimes(1)
      vi.advanceTimersByTime(120_000)
      expect(h.autoUpdater.downloadUpdate).toHaveBeenCalledTimes(1)
    })

    it('checagens repetidas durante a espera não reiniciam o sorteio', async () => {
      await startAndWait()
      await h.autoUpdater.emit('update-available', { version: '0.7.0' })
      vi.advanceTimersByTime(40_000)
      await h.autoUpdater.emit('update-available', { version: '0.7.0' })
      vi.advanceTimersByTime(20_000)
      expect(h.autoUpdater.downloadUpdate).toHaveBeenCalledTimes(1)
    })

    it('entrar em chamada durante a espera não segura o download', async () => {
      await startAndWait()
      await h.autoUpdater.emit('update-available', { version: '0.7.0' })
      h.state.inCall = true
      vi.advanceTimersByTime(60_000)
      expect(h.autoUpdater.downloadUpdate).toHaveBeenCalledTimes(1)
    })
  })
  describe('Linux sem AppImage (instalação por usuário)', () => {
    forceLinux()
    beforeEach(() => {
      h.linux.kind = 'linux-managed'
    })

    it('usa o updater próprio com o mesmo endereço, sem o electron-updater', async () => {
      await startUpdater()
      expect(h.autoUpdater.setFeedURL).not.toHaveBeenCalled()
      expect(h.linux.checkForUpdates).toHaveBeenCalled()
      expect(h.linux.options).toMatchObject({
        feedUrl: 'http://srv/updates/',
        currentVersion: '0.6.0'
      })
    })

    it('assinatura do .tar.gz conferida antes de extrair; instala pelo updater próprio', async () => {
      await startUpdater()
      await h.linux.emit('update-available', { version: '0.7.0' })
      expect(h.linux.downloadUpdate).toHaveBeenCalled()
      const event = {
        version: '0.7.0',
        downloadedFile: '/home/u/.local/share/salinha/downloads/Salinha-0.7.0-x64.tar.gz'
      }
      await h.linux.emit('update-downloaded', event)
      expect(h.fetch).toHaveBeenCalledWith('http://srv/updates/Salinha-0.7.0-x64.tar.gz.sig')
      expect(h.linux.stage).toHaveBeenCalledWith(event, Buffer.from('instalador'))
      expect(h.state.sent).toContainEqual(['update:ready', '0.7.0'])
      h.state.handlers['update:install']({ sender: win.webContents })
      expect(h.linux.quitAndInstall).toHaveBeenCalledWith(true, true)
      expect(h.autoUpdater.quitAndInstall).not.toHaveBeenCalled()
    })

    it('em chamada baixa e verifica sozinho; o clique instala na hora, sem novo download', async () => {
      h.state.inCall = true
      await startUpdater()
      await h.linux.emit('update-available', { version: '0.7.0' })
      expect(h.linux.downloadUpdate).toHaveBeenCalledTimes(1)
      await h.linux.emit('update-downloaded', { version: '0.7.0', downloadedFile: '/d/x.tar.gz' })
      expect(h.linux.stage).toHaveBeenCalled()
      expect(h.state.sent).toContainEqual(['update:ready', '0.7.0'])
      expect(h.linux.quitAndInstall).not.toHaveBeenCalled()

      h.state.handlers['update:install']({ sender: win.webContents })
      expect(h.linux.quitAndInstall).toHaveBeenCalledWith(true, true)
      expect(h.linux.downloadUpdate).toHaveBeenCalledTimes(1)
    })

    it('clicar antes do fim do download instala assim que terminar e verificar', async () => {
      h.state.inCall = true
      await startUpdater()
      await h.linux.emit('update-available', { version: '0.7.0' })
      h.state.handlers['update:install']({ sender: win.webContents })
      expect(h.linux.downloadUpdate).toHaveBeenCalledTimes(1)
      expect(h.linux.quitAndInstall).not.toHaveBeenCalled()

      await h.linux.emit('update-downloaded', { version: '0.7.0', downloadedFile: '/d/x.tar.gz' })
      expect(h.linux.stage).toHaveBeenCalled()
      expect(h.linux.quitAndInstall).toHaveBeenCalledWith(true, true)
    })

    it('download de uma versão já substituída não é extraído: baixa a mais nova', async () => {
      await startUpdater()
      await h.linux.emit('update-available', { version: '0.7.0' })
      await h.linux.emit('update-available', { version: '0.7.1' })
      await h.linux.emit('update-downloaded', { version: '0.7.0', downloadedFile: '/d/a.tar.gz' })
      expect(h.linux.stage).not.toHaveBeenCalled()
      expect(h.state.sent.some(([channel]) => channel === 'update:error')).toBe(false)
      expect(h.linux.downloadUpdate).toHaveBeenCalledTimes(2)
    })

    it('assinatura inválida: nem extrai, e fica registrado em update.log', async () => {
      h.state.validSignature = false
      await startUpdater()
      await h.linux.emit('update-available', { version: '0.7.0' })
      await h.linux.emit('update-downloaded', { version: '0.7.0', downloadedFile: '/d/x.tar.gz' })
      expect(h.linux.stage).not.toHaveBeenCalled()
      const { appendLog } = await import('../app/appLog')
      expect(appendLog).toHaveBeenCalledWith(
        'update.log',
        expect.stringMatching(/instalador recusado: .*assinatura inválida/)
      )
      expect(h.state.sent.some(([channel]) => channel === 'update:error')).toBe(true)
      expect(h.state.sent).not.toContainEqual(['update:ready', '0.7.0'])
    })

    it('pacote recusado na extração (versão interna errada) não fica pronto', async () => {
      h.linux.stage.mockRejectedValueOnce(new Error('pacote não é a versão 0.7.0'))
      await startUpdater()
      await h.linux.emit('update-available', { version: '0.7.0' })
      h.state.handlers['update:install']({ sender: win.webContents })
      await h.linux.emit('update-downloaded', { version: '0.7.0', downloadedFile: '/d/x.tar.gz' })
      expect(h.linux.quitAndInstall).not.toHaveBeenCalled()
      expect(h.state.sent.some(([channel]) => channel === 'update:error')).toBe(true)
    })

    it('confirma a abertura da versão para o lançador depois de alguns segundos', async () => {
      vi.useRealTimers()
      vi.useFakeTimers({ toFake: ['setInterval', 'setTimeout'] })
      await startUpdater()
      expect(h.linux.confirmStartup).not.toHaveBeenCalled()
      vi.advanceTimersByTime(10_000)
      expect(h.linux.confirmStartup).toHaveBeenCalledOnce()
    })
  })
  describe('falhas e recusas não viram download em loop', () => {
    forceLinux()
    const offer = { version: '0.7.0', path: 'Salinha-0.7.0-x64.tar.gz', sha512: 'aa' }
    const downloaded = {
      version: '0.7.0',
      downloadedFile: '/d/downloads/Salinha-0.7.0-x64.tar.gz'
    }

    // setTimeout falso: promessas resolvidas na mão.
    const settle = async (): Promise<void> => {
      for (let i = 0; i < 20; i++) await Promise.resolve()
    }

    beforeEach(() => {
      h.linux.kind = 'linux-managed'
      vi.useRealTimers()
      vi.useFakeTimers({ toFake: ['setInterval', 'setTimeout', 'Date'] })
      vi.spyOn(Math, 'random').mockReturnValue(0)
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('busca o .sig antes do pacote; sem ele não baixa e espera cada vez mais', async () => {
      h.fetch.mockResolvedValue({ ok: false, text: async () => '' })
      await startUpdater()
      await h.linux.emit('update-available', offer)
      await settle()
      expect(h.fetch).toHaveBeenCalledWith('http://srv/updates/Salinha-0.7.0-x64.tar.gz.sig')
      expect(h.linux.downloadUpdate).not.toHaveBeenCalled()

      // Checagem seguinte (60 s depois) ainda dentro da espera de 1 min: nada.
      vi.advanceTimersByTime(50_000)
      await h.linux.emit('update-available', offer)
      await settle()
      expect(h.fetch).toHaveBeenCalledTimes(1)

      // Passou 1 min: tenta de novo; falhou outra vez → espera 5 min.
      vi.advanceTimersByTime(15_000)
      await h.linux.emit('update-available', offer)
      await settle()
      expect(h.fetch).toHaveBeenCalledTimes(2)
      vi.advanceTimersByTime(4 * 60_000)
      await h.linux.emit('update-available', offer)
      await settle()
      expect(h.fetch).toHaveBeenCalledTimes(2)

      // .sig publicado: baixa o pacote.
      h.fetch.mockResolvedValue({ ok: true, text: async () => 'assinatura' })
      vi.advanceTimersByTime(60_000 + 1)
      await h.linux.emit('update-available', offer)
      await settle()
      expect(h.linux.downloadUpdate).toHaveBeenCalledTimes(1)
    })

    it('recusada (assinatura) não é baixada de novo, nem depois de reiniciar; sha512 novo sim', async () => {
      h.state.validSignature = false
      await startUpdater()
      await h.linux.emit('update-available', offer)
      await settle()
      await h.linux.emit('update-downloaded', downloaded)
      expect(h.linux.downloadUpdate).toHaveBeenCalledTimes(1)
      expect(h.state.sent).toContainEqual(['update:error', expect.stringMatching(/segurança/)])

      vi.advanceTimersByTime(7 * 3_600_000)
      await h.linux.emit('update-available', offer)
      await settle()
      expect(h.linux.downloadUpdate).toHaveBeenCalledTimes(1)

      // Reinicia o app: a recusa está gravada em userData.
      vi.resetModules()
      h.linux.reset()
      h.linux.kind = 'linux-managed'
      await startUpdater()
      await h.linux.emit('update-available', offer)
      await settle()
      expect(h.linux.downloadUpdate).toHaveBeenCalledTimes(1)
      // Clicar Atualizar também não baixa o mesmo par.
      h.state.handlers['update:install']({ sender: win.webContents })
      await settle()
      expect(h.linux.downloadUpdate).toHaveBeenCalledTimes(1)

      // Republicado (sha512 novo): tenta.
      h.state.validSignature = true
      await h.linux.emit('update-available', { ...offer, sha512: 'bb' })
      await settle()
      expect(h.linux.downloadUpdate).toHaveBeenCalledTimes(2)
    })

    it('falha passageira ao buscar o .sig depois do download não apaga o pacote', async () => {
      await startUpdater()
      // Sem path no aviso (electron-updater antigo): o .sig vem depois do download.
      await h.linux.emit('update-available', { version: '0.7.0' })
      await settle()
      h.fetch.mockRejectedValueOnce(new Error('rede caiu'))
      await h.linux.emit('update-downloaded', downloaded)
      expect(h.rm).not.toHaveBeenCalled()
      expect(h.linux.stage).not.toHaveBeenCalled()
      expect(h.state.sent).not.toContainEqual(['update:ready', '0.7.0'])

      // Mais tarde: o mesmo arquivo (cache) passa e fica pronto.
      vi.advanceTimersByTime(61_000)
      await h.linux.emit('update-available', { version: '0.7.0' })
      await settle()
      await h.linux.emit('update-downloaded', downloaded)
      expect(h.state.sent).toContainEqual(['update:ready', '0.7.0'])
    })

    it('não instala sozinho ao abrir o que o updater do Linux bloqueia (migração, versão ruim)', async () => {
      h.state.files[join('/tmp/concord-teste', 'update-verified.json')] = JSON.stringify({
        version: '0.7.0'
      })
      h.linux.canAutoInstall.mockReturnValue(false)
      await startUpdater()
      await h.linux.emit('update-available', offer)
      await settle()
      await h.linux.emit('update-downloaded', downloaded)
      expect(h.linux.canAutoInstall).toHaveBeenCalledWith('0.7.0')
      expect(h.linux.quitAndInstall).not.toHaveBeenCalled()
      expect(h.state.sent).toContainEqual(['update:ready', '0.7.0'])
    })

    it('versão já verificada antes instala sozinha ao abrir quando o updater deixa', async () => {
      h.state.files[join('/tmp/concord-teste', 'update-verified.json')] = JSON.stringify({
        version: '0.7.0'
      })
      await startUpdater()
      await h.linux.emit('update-available', offer)
      await settle()
      await h.linux.emit('update-downloaded', downloaded)
      expect(h.linux.quitAndInstall).toHaveBeenCalledWith(true, true)
    })
  })

  describe('aviso de sandbox desligado (Linux)', () => {
    forceLinux()
    afterEach(() => {
      delete process.env.SALINHA_SANDBOX_OFF
    })

    it('mostra uma vez só, mesmo reiniciando', async () => {
      process.env.SALINHA_SANDBOX_OFF = 'apparmor'
      await startUpdater()
      const take = (): unknown =>
        h.state.handlers['update:sandbox-notice']({ sender: win.webContents })
      expect(h.state.handlers['update:sandbox-notice']({ sender: {} })).toBeNull()
      expect(take()).toBe('apparmor')
      expect(take()).toBeNull()
      vi.resetModules()
      await startUpdater()
      expect(take()).toBeNull()
    })

    it('com o sandbox ligado não avisa', async () => {
      await startUpdater()
      expect(h.state.handlers['update:sandbox-notice']({ sender: win.webContents })).toBeNull()
    })
  })
})
