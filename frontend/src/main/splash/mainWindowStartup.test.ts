import { describe, expect, it, vi } from 'vitest'
import {
  createMainWindowStartup,
  INITIAL_STARTUP,
  startupStep,
  type MainWindowStartupEvent
} from './mainWindowStartup'

function run(events: MainWindowStartupEvent[]): Array<string | null> {
  let state = INITIAL_STARTUP
  return events.map((event) => {
    const step = startupStep(state, event)
    state = step.state
    return step.action
  })
}

describe('startupStep', () => {
  it('pronta antes da checagem terminar: só aparece quando a abertura libera', () => {
    expect(run(['created', 'ready', 'released'])).toEqual([null, null, 'reveal'])
  })

  it('checagem termina antes de a janela ficar pronta: aparece no ready-to-show', () => {
    expect(run(['created', 'released', 'ready'])).toEqual([null, null, 'reveal'])
  })

  it('versão nova para instalar: descarta a janela escondida', () => {
    expect(run(['created', 'ready', 'updating'])).toEqual([null, null, 'discard'])
  })

  it('a atualização não instalou (pulou, falhou): cria a janela de novo ao liberar', () => {
    expect(run(['created', 'updating', 'closed', 'released'])).toEqual([
      null,
      'discard',
      null,
      'create'
    ])
  })

  it('o aviso de atualização repetido (progresso) não descarta de novo', () => {
    expect(run(['created', 'updating', 'updating'])).toEqual([null, 'discard', null])
  })

  it('aparece uma vez só, mesmo com ready-to-show repetido', () => {
    expect(run(['created', 'released', 'ready', 'ready'])).toEqual([null, null, 'reveal', null])
  })

  it('janela recriada depois da abertura (macOS, activate): aparece quando ficar pronta', () => {
    expect(run(['created', 'released', 'ready', 'closed', 'created', 'ready'])).toEqual([
      null,
      null,
      'reveal',
      null,
      null,
      'reveal'
    ])
  })
})

function setup(): {
  startup: ReturnType<typeof createMainWindowStartup>
  deps: { create: ReturnType<typeof vi.fn>; discard: ReturnType<typeof vi.fn>; reveal: ReturnType<typeof vi.fn> }
} {
  const deps = { create: vi.fn(), discard: vi.fn(), reveal: vi.fn() }
  return { startup: createMainWindowStartup(deps), deps }
}

describe('createMainWindowStartup', () => {
  it('carrega em paralelo e mostra ao liberar', () => {
    const { startup, deps } = setup()
    startup.dispatch('created')
    startup.dispatch('ready')
    expect(deps.reveal).not.toHaveBeenCalled()
    startup.dispatch('released')
    expect(deps.reveal).toHaveBeenCalledTimes(1)
  })

  it('fases da janelinha: baixando/instalando descarta, checando não', () => {
    const { startup, deps } = setup()
    startup.dispatch('created')
    startup.splashPhase('checking')
    expect(deps.discard).not.toHaveBeenCalled()
    startup.splashPhase('downloading')
    expect(deps.discard).toHaveBeenCalledTimes(1)
    startup.splashPhase('opening')
    startup.dispatch('released')
    expect(deps.create).toHaveBeenCalledTimes(1)
  })

  it('a janelinha é entregue a uma janela que só "fica pronta" quando aparece', () => {
    const { startup, deps } = setup()
    const target = startup.handOffTarget()
    const closeSplash = vi.fn()
    startup.dispatch('created')
    startup.dispatch('ready')
    target.once('ready-to-show', closeSplash)
    expect(closeSplash).not.toHaveBeenCalled()
    startup.dispatch('released')
    expect(closeSplash).toHaveBeenCalledTimes(1)
    target.show()
    expect(deps.reveal).toHaveBeenCalledTimes(2)
  })

  it('entregue depois de já ter aparecido: fecha a janelinha na hora', () => {
    const { startup } = setup()
    startup.dispatch('created')
    startup.dispatch('released')
    startup.dispatch('ready')
    const closeSplash = vi.fn()
    startup.handOffTarget().once('ready-to-show', closeSplash)
    expect(closeSplash).toHaveBeenCalledTimes(1)
  })
})
