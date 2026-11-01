// Abertura do app com a janelinha (ADR 0044): liga a janelinha ao fluxo de
// atualização (updates/startupFlow.ts) e, depois, à janela principal. Sem
// Electron aqui: a janela de verdade vem de splashWindow.ts.
import { createStartupFlow, type StartupUpdate, type StartupView } from '../updates/startupFlow'

/** Janela principal que não fica pronta nesse tempo: aparece assim mesmo e a janelinha sai. */
export const HANDOFF_TIMEOUT_MS = 30_000

/** O que a janelinha usa da janela principal. */
export interface MainWindowLike {
  once(event: 'ready-to-show', listener: () => void): unknown
  show(): void
}

export interface SplashWindow {
  show(view: StartupView): void
  onSkip(listener: () => void): void
  close(): void
}

export interface StartupSplashDeps {
  /** aberto pelo login do sistema: o app fica na bandeja */
  hidden: boolean
  window: SplashWindow
  log: (message: string, error?: unknown) => void
  saveHiddenRelaunch: () => void
  clearHiddenRelaunch: () => void
}

export interface StartupSplash {
  /** Atualiza, se houver versão nova, e resolve quando é hora de abrir. */
  update(update: StartupUpdate | null): Promise<void>
  /** Janela principal criada: a janelinha some quando ela aparecer (já, se escondido). */
  handOff(main: MainWindowLike): void
}

export function startSplash(deps: StartupSplashDeps): StartupSplash {
  const { window } = deps

  async function update(updater: StartupUpdate | null): Promise<void> {
    if (!updater) {
      window.show({ phase: 'opening', percent: null, canSkip: false })
      return
    }
    const flow = createStartupFlow({
      check: () => updater.check(),
      download: () => updater.download(),
      show: (view) => {
        // O instalador do Windows reabre sem --hidden: a marca mantém na bandeja.
        if (view.phase === 'installing' && deps.hidden) deps.saveHiddenRelaunch()
        window.show(view)
      },
      log: deps.log
    })
    updater.watch(flow)
    window.onSkip(() => flow.skip())
    await flow.run()
    updater.watch(null)
    deps.clearHiddenRelaunch()
  }

  function handOff(main: MainWindowLike): void {
    if (deps.hidden) {
      window.close()
      return
    }
    let closed = false
    const close = (): void => {
      if (closed) return
      closed = true
      clearTimeout(timer)
      window.close()
    }
    // Sem a janelinha e sem a principal, o app pareceria fechado.
    const timer = setTimeout(() => {
      main.show()
      close()
    }, HANDOFF_TIMEOUT_MS)
    main.once('ready-to-show', close)
  }

  return { update, handOff }
}
