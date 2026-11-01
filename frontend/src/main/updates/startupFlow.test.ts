import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CHECK_TIMEOUT_MS,
  INSTALL_TIMEOUT_MS,
  SKIP_AFTER_MS,
  STALL_TIMEOUT_MS,
  createStartupFlow,
  type StartupFlowDeps,
  type StartupView
} from './startupFlow'

interface Setup {
  flow: ReturnType<typeof createStartupFlow>
  deps: {
    check: ReturnType<typeof vi.fn>
    download: ReturnType<typeof vi.fn>
    log: ReturnType<typeof vi.fn>
  }
  views: StartupView[]
  last: () => StartupView
  done: Promise<void>
  isOpen: () => boolean
}

function setup(check: StartupFlowDeps['check'] = async () => false): Setup {
  const views: StartupView[] = []
  const deps = {
    check: vi.fn(check),
    download: vi.fn(),
    show: (view: StartupView) => views.push(view),
    log: vi.fn()
  }
  const flow = createStartupFlow(deps)
  let opened = false
  const done = flow.run().then(() => {
    opened = true
  })
  const last = (): StartupView => views[views.length - 1]
  return { flow, deps, views, last, done, isOpen: () => opened }
}

/** Deixa as promessas pendentes (check, run) andarem. */
const settle = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await Promise.resolve()
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('createStartupFlow', () => {
  it('começa procurando atualizações', () => {
    const { views } = setup(() => new Promise(() => {}))
    expect(views[0]).toEqual({ phase: 'checking', percent: null, canSkip: false })
  })

  it('sem versão nova: abre logo', async () => {
    const { last, done, deps } = setup(async () => false)
    await done
    expect(last().phase).toBe('opening')
    expect(deps.download).not.toHaveBeenCalled()
  })

  it('checagem que não responde em poucos segundos não trava a abertura', async () => {
    const { isOpen, deps } = setup(() => new Promise(() => {}))
    await vi.advanceTimersByTimeAsync(CHECK_TIMEOUT_MS - 1)
    expect(isOpen()).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(isOpen()).toBe(true)
    expect(deps.log).toHaveBeenCalledWith(expect.stringContaining('tempo'), undefined)
  })

  it('checagem que falha (sem rede): abre e registra', async () => {
    const erro = new Error('sem rede')
    const { done, deps, last } = setup(async () => {
      throw erro
    })
    await done
    expect(last().phase).toBe('opening')
    expect(deps.log).toHaveBeenCalledWith(expect.any(String), erro)
  })

  it('checando → baixando → instalando: segue o progresso real', async () => {
    const { flow, deps, views, last, isOpen } = setup(async () => true)
    await settle()
    expect(deps.download).toHaveBeenCalledTimes(1)
    expect(last()).toEqual({ phase: 'downloading', percent: 0, canSkip: false })
    flow.progress(42.4)
    expect(last()).toMatchObject({ phase: 'downloading', percent: 42 })
    flow.verifying()
    expect(last()).toEqual({ phase: 'installing', percent: null, canSkip: false })
    expect(flow.ready()).toBe(true)
    await settle()
    expect(isOpen()).toBe(false)
    expect(views.map((v) => v.phase)).toEqual([
      'checking',
      'downloading',
      'downloading',
      'installing'
    ])
  })

  it('progresso repetido não redesenha a janela', async () => {
    const { flow, views } = setup(async () => true)
    await settle()
    flow.progress(10)
    flow.progress(10.2)
    expect(views.filter((v) => v.percent === 10)).toHaveLength(1)
  })

  it('"Abrir sem atualizar" só aparece se o download demorar', async () => {
    const { flow, last, isOpen } = setup(async () => true)
    await settle()
    expect(last().canSkip).toBe(false)
    await vi.advanceTimersByTimeAsync(SKIP_AFTER_MS)
    expect(last()).toMatchObject({ phase: 'downloading', canSkip: true })
    flow.skip()
    await settle()
    expect(isOpen()).toBe(true)
    expect(last().phase).toBe('opening')
  })

  it('pular antes do botão aparecer não faz nada', async () => {
    const { flow, isOpen } = setup(async () => true)
    await settle()
    flow.skip()
    await settle()
    expect(isOpen()).toBe(false)
  })

  it('o botão não volta na fase de instalação', async () => {
    const { flow, last } = setup(async () => true)
    await settle()
    flow.verifying()
    await vi.advanceTimersByTimeAsync(SKIP_AFTER_MS)
    expect(last()).toMatchObject({ phase: 'installing', canSkip: false })
  })

  it('download parado (sem progresso) abre a versão atual', async () => {
    const { flow, isOpen, deps } = setup(async () => true)
    await settle()
    await vi.advanceTimersByTimeAsync(STALL_TIMEOUT_MS - 1000)
    flow.progress(5)
    await vi.advanceTimersByTimeAsync(STALL_TIMEOUT_MS - 1)
    expect(isOpen()).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(isOpen()).toBe(true)
    expect(deps.log).toHaveBeenCalledWith(expect.stringContaining('parado'), undefined)
  })

  it('falha no download ou na assinatura: abre a versão atual e registra', async () => {
    const { flow, done, deps, last } = setup(async () => true)
    await settle()
    const erro = new Error('assinatura inválida')
    flow.failed('instalador recusado', erro)
    await done
    expect(last().phase).toBe('opening')
    expect(deps.log).toHaveBeenCalledWith(expect.stringContaining('instalador recusado'), erro)
  })

  it('instalação que falha (instalador não abriu) abre a versão atual', async () => {
    const { flow, done } = setup(async () => true)
    await settle()
    flow.verifying()
    expect(flow.ready()).toBe(true)
    flow.failed('instalação falhou')
    await done
  })

  it('instalação que nunca fecha o app: abre depois do limite', async () => {
    const { flow, isOpen } = setup(async () => true)
    await settle()
    flow.verifying()
    flow.ready()
    await vi.advanceTimersByTimeAsync(INSTALL_TIMEOUT_MS)
    expect(isOpen()).toBe(true)
  })

  it('depois de abrir, eventos atrasados não instalam nem mudam a janela', async () => {
    const { flow, done, views } = setup(async () => false)
    await done
    const count = views.length
    flow.progress(50)
    flow.verifying()
    expect(flow.ready()).toBe(false)
    flow.failed('tarde')
    expect(views).toHaveLength(count)
  })

  it('pulou: o download segue, mas pronto não instala', async () => {
    const { flow, done } = setup(async () => true)
    await settle()
    await vi.advanceTimersByTimeAsync(SKIP_AFTER_MS)
    flow.skip()
    await done
    expect(flow.ready()).toBe(false)
  })

  it('pronto antes de verificar (cache) também instala', async () => {
    const { flow } = setup(async () => true)
    await settle()
    expect(flow.ready()).toBe(true)
  })

  it('checagem que responde depois do limite não começa download', async () => {
    let answer: (value: boolean) => void = () => {}
    const { deps, isOpen } = setup(() => new Promise((r) => (answer = r)))
    await vi.advanceTimersByTimeAsync(CHECK_TIMEOUT_MS)
    expect(isOpen()).toBe(true)
    answer(true)
    await settle()
    expect(deps.download).not.toHaveBeenCalled()
  })
})
