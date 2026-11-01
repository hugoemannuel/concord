import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StartupUpdate, StartupView, StartupWatcher } from '../updates/startupFlow'
import { HANDOFF_TIMEOUT_MS, startSplash, type SplashWindow } from './startupSplash'

type FakeWindow = SplashWindow & {
  views: StartupView[]
  clickSkip: () => void
  close: ReturnType<typeof vi.fn>
}

function fakeWindow(): FakeWindow {
  let skip: () => void = () => {}
  return {
    views: [] as StartupView[],
    show(view: StartupView) {
      this.views.push(view)
    },
    onSkip: (fn: () => void) => {
      skip = fn
    },
    clickSkip: () => skip(),
    close: vi.fn()
  }
}

type FakeUpdate = StartupUpdate & { state: { watcher: StartupWatcher | null } }

function fakeUpdate(available: boolean): FakeUpdate {
  const state = { watcher: null as StartupWatcher | null }
  const update: FakeUpdate = {
    state,
    check: vi.fn(async () => available),
    download: vi.fn(),
    watch: vi.fn((w: StartupWatcher | null) => {
      state.watcher = w
    })
  }
  return update
}

function setup(hidden = false): {
  splash: ReturnType<typeof startSplash>
  window: FakeWindow
  deps: {
    saveHiddenRelaunch: ReturnType<typeof vi.fn>
    clearHiddenRelaunch: ReturnType<typeof vi.fn>
  }
} {
  const window = fakeWindow()
  const deps = {
    hidden,
    window,
    log: vi.fn(),
    saveHiddenRelaunch: vi.fn(),
    clearHiddenRelaunch: vi.fn()
  }
  return { splash: startSplash(deps), window, deps }
}

const settle = async (): Promise<void> => {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('startSplash', () => {
  it('sem atualizador (dev, sem endereço): vai direto para "Abrindo…"', async () => {
    const { splash, window } = setup()
    await splash.update(null)
    expect(window.views.map((v) => v.phase)).toEqual(['opening'])
  })

  it('sem versão nova: checa e abre; a janelinha solta o updater', async () => {
    const { splash, window, deps } = setup()
    const update = fakeUpdate(false)
    await splash.update(update)
    expect(window.views.map((v) => v.phase)).toEqual(['checking', 'opening'])
    expect(update.state.watcher).toBeNull()
    expect(deps.clearHiddenRelaunch).toHaveBeenCalled()
  })

  it('com versão nova: o updater avisa a janelinha e o botão pula', async () => {
    const { splash, window } = setup()
    const update = fakeUpdate(true)
    let opened = false
    void splash.update(update).then(() => (opened = true))
    await settle()
    expect(update.download).toHaveBeenCalled()
    update.state.watcher?.progress(30)
    expect(window.views.at(-1)).toMatchObject({ phase: 'downloading', percent: 30 })
    await vi.advanceTimersByTimeAsync(5_000)
    window.clickSkip()
    await settle()
    expect(opened).toBe(true)
    expect(update.state.watcher).toBeNull()
  })

  it('aberto pelo login e instalando: marca para reabrir escondido', async () => {
    const { splash, deps } = setup(true)
    const update = fakeUpdate(true)
    void splash.update(update)
    await settle()
    update.state.watcher?.verifying()
    expect(deps.saveHiddenRelaunch).toHaveBeenCalledTimes(1)
  })

  it('aberto normalmente e instalando: não marca', async () => {
    const { splash, deps } = setup(false)
    const update = fakeUpdate(true)
    void splash.update(update)
    await settle()
    update.state.watcher?.verifying()
    expect(deps.saveHiddenRelaunch).not.toHaveBeenCalled()
  })

  it('a instalação falhou e abriu: a marca de reabrir escondido some', async () => {
    const { splash, deps } = setup(true)
    const update = fakeUpdate(true)
    const done = splash.update(update)
    await settle()
    update.state.watcher?.verifying()
    update.state.watcher?.failed('instalação falhou')
    await done
    expect(deps.clearHiddenRelaunch).toHaveBeenCalled()
  })

  describe('entrega para a janela principal', () => {
    const main = (): {
      once: ReturnType<typeof vi.fn>
      show: ReturnType<typeof vi.fn>
      fireReady: () => void
    } => {
      let ready: () => void = () => {}
      return {
        once: vi.fn((_event: 'ready-to-show', fn: () => void) => {
          ready = fn
        }),
        show: vi.fn(),
        fireReady: () => ready()
      }
    }

    it('fecha quando a janela principal aparece', () => {
      const { splash, window } = setup()
      const win = main()
      splash.handOff(win)
      expect(window.close).not.toHaveBeenCalled()
      win.fireReady()
      expect(window.close).toHaveBeenCalledTimes(1)
    })

    it('aberto pelo login: some logo, deixando o app na bandeja', () => {
      const { splash, window } = setup(true)
      splash.handOff(main())
      expect(window.close).toHaveBeenCalledTimes(1)
    })

    it('janela principal que demora a ficar pronta: aparece assim mesmo e a janelinha sai', async () => {
      const { splash, window } = setup()
      const win = main()
      splash.handOff(win)
      await vi.advanceTimersByTimeAsync(HANDOFF_TIMEOUT_MS - 1)
      expect(window.close).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(1)
      expect(win.show).toHaveBeenCalled()
      win.fireReady()
      expect(window.close).toHaveBeenCalledTimes(1)
    })

    it('pronta a tempo: a principal aparece pelo próprio ready-to-show, não pelo limite', async () => {
      const { splash } = setup()
      const win = main()
      splash.handOff(win)
      win.fireReady()
      await vi.advanceTimersByTimeAsync(HANDOFF_TIMEOUT_MS)
      expect(win.show).not.toHaveBeenCalled()
    })
  })
})
