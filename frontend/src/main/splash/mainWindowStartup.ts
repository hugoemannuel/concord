// Janela principal na abertura: ela é criada escondida e carrega o renderer
// enquanto a janelinha checa a atualização; só aparece quando a abertura
// libera. Se uma versão nova for instalar (raro), a janela escondida é
// descartada (o app vai fechar) e, se a instalação não acontecer, é criada de
// novo ao liberar. Sem Electron aqui: index.ts liga as ações à BrowserWindow.
import type { StartupPhase } from '../updates/startupFlow'
import type { MainWindowLike } from './startupSplash'

export interface MainWindowStartupState {
  window: 'none' | 'loading' | 'ready'
  /** a checagem de atualização terminou e o app vai abrir */
  released: boolean
  /** a janela atual já apareceu */
  revealed: boolean
}

/** created/ready/closed: da BrowserWindow; updating/released: da janelinha. */
export type MainWindowStartupEvent = 'created' | 'ready' | 'closed' | 'updating' | 'released'

export type MainWindowStartupAction = 'create' | 'discard' | 'reveal' | null

export const INITIAL_STARTUP: MainWindowStartupState = {
  window: 'none',
  released: false,
  revealed: false
}

interface Step {
  state: MainWindowStartupState
  action: MainWindowStartupAction
}

function reveal(state: MainWindowStartupState): Step {
  if (!state.released || state.window !== 'ready' || state.revealed) {
    return { state, action: null }
  }
  return { state: { ...state, revealed: true }, action: 'reveal' }
}

function released(state: MainWindowStartupState): Step {
  const next = { ...state, released: true }
  if (next.window === 'none') return { state: next, action: 'create' }
  return reveal(next)
}

function updating(state: MainWindowStartupState): Step {
  if (state.window === 'none' || state.released) return { state, action: null }
  return { state: { ...state, window: 'none' }, action: 'discard' }
}

/** Decide o que fazer com a janela principal a cada evento da abertura. */
export function startupStep(
  state: MainWindowStartupState,
  event: MainWindowStartupEvent
): Step {
  switch (event) {
    case 'created':
      return { state: { ...state, window: 'loading', revealed: false }, action: null }
    case 'ready':
      return reveal({ ...state, window: 'ready' })
    case 'closed':
      return { state: { ...state, window: 'none' }, action: null }
    case 'updating':
      return updating(state)
    case 'released':
      return released(state)
  }
}

/** Fases da janelinha em que uma versão nova vai instalar. */
const UPDATING_PHASES: ReadonlySet<StartupPhase> = new Set(['downloading', 'installing'])

export interface MainWindowStartupDeps {
  /** cria a janela principal escondida (ela avisa 'created') */
  create: () => void
  /** fecha a janela escondida sem passar pela bandeja */
  discard: () => void
  /** mostra a janela (fica escondida se o app abriu pelo login do sistema) */
  reveal: () => void
}

export interface MainWindowStartup {
  dispatch(event: MainWindowStartupEvent): void
  /** Fase mostrada pela janelinha. */
  splashPhase(phase: StartupPhase): void
  /** O que a janelinha usa para sair: "pronta" = já apareceu. */
  handOffTarget(): MainWindowLike
}

export function createMainWindowStartup(deps: MainWindowStartupDeps): MainWindowStartup {
  let state = INITIAL_STARTUP
  let onReveal: Array<() => void> = []

  function dispatch(event: MainWindowStartupEvent): void {
    const step = startupStep(state, event)
    state = step.state
    if (step.action === 'create') deps.create()
    else if (step.action === 'discard') deps.discard()
    else if (step.action === 'reveal') revealed()
  }

  function revealed(): void {
    deps.reveal()
    const listeners = onReveal
    onReveal = []
    listeners.forEach((listener) => listener())
  }

  return {
    dispatch,
    splashPhase(phase) {
      if (UPDATING_PHASES.has(phase)) dispatch('updating')
    },
    handOffTarget: () => ({
      once(_event, listener) {
        if (state.revealed) listener()
        else onReveal.push(listener)
      },
      show: () => deps.reveal()
    })
  }
}
