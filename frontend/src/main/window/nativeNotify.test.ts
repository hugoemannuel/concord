import { describe, expect, it, vi } from 'vitest'
import { handleNotify, toastOptions, type NotifyPayload, type NotifyWindow } from './nativeNotify'

function fakeWindow(over: Partial<{ visible: boolean; focused: boolean; destroyed: boolean }> = {}) {
  const state = { visible: false, focused: false, destroyed: false, ...over }
  return {
    isDestroyed: () => state.destroyed,
    isVisible: () => state.visible,
    isFocused: () => state.focused,
    flashFrame: vi.fn()
  } satisfies NotifyWindow
}

function setup(win: ReturnType<typeof fakeWindow> | null, supported = true) {
  const listeners: Record<string, (...a: unknown[]) => void> = {}
  const toast = {
    on: vi.fn((event: string, fn: (...a: unknown[]) => void) => {
      listeners[event] = fn
    }),
    show: vi.fn()
  }
  const deps = {
    window: () => win,
    icon: 'icone.png',
    supported: () => supported,
    createToast: vi.fn(() => toast),
    open: vi.fn(),
    countUnseen: vi.fn(),
    log: vi.fn()
  }
  return { deps, toast, listeners }
}

const payload: NotifyPayload = { title: 'Ana', body: 'oi', route: '/dm/1' }

describe('toastOptions', () => {
  it('leva título, texto e ícone', () => {
    expect(toastOptions(payload, 'i.png')).toMatchObject({ title: 'Ana', body: 'oi', icon: 'i.png' })
  })

  it('sai sem o som do sistema: quem toca o som escolhido é o app', () => {
    expect(toastOptions(payload, 'i.png').silent).toBe(true)
    expect(toastOptions({ ...payload, urgent: true }, 'i.png').silent).toBe(true)
  })
})

describe('handleNotify', () => {
  it('janela fora de vista: mostra o toast, pisca e conta a não lida', () => {
    const win = fakeWindow()
    const { deps, toast } = setup(win)
    handleNotify(payload, deps)
    expect(deps.createToast).toHaveBeenCalledWith(toastOptions(payload, 'icone.png'))
    expect(toast.show).toHaveBeenCalled()
    expect(win.flashFrame).toHaveBeenCalledWith(true)
    expect(deps.countUnseen).toHaveBeenCalledWith(win)
  })

  it('clique no toast abre a janela na rota do aviso', () => {
    const win = fakeWindow()
    const { deps, listeners } = setup(win)
    handleNotify(payload, deps)
    listeners.click()
    expect(deps.open).toHaveBeenCalledWith(win, '/dm/1')
  })

  it('falha do toast vai para o log', () => {
    const { deps, listeners } = setup(fakeWindow())
    handleNotify(payload, deps)
    listeners.failed({}, 'erro x')
    listeners.close()
    expect(deps.log).toHaveBeenCalledWith('notificação falhou: erro x')
  })

  it('janela em foco e conversa na tela: nada', () => {
    const { deps } = setup(fakeWindow({ visible: true, focused: true }))
    handleNotify(payload, deps)
    expect(deps.createToast).not.toHaveBeenCalled()
    expect(deps.countUnseen).not.toHaveBeenCalled()
  })

  it('sem janela (ou destruída): nada', () => {
    const none = setup(null)
    handleNotify(payload, none.deps)
    const gone = setup(fakeWindow({ destroyed: true }))
    handleNotify(payload, gone.deps)
    expect(none.deps.createToast).not.toHaveBeenCalled()
    expect(gone.deps.createToast).not.toHaveBeenCalled()
  })

  it('toast desligado nas preferências: só a barra de tarefas', () => {
    const win = fakeWindow()
    const { deps } = setup(win)
    handleNotify({ ...payload, toast: false }, deps)
    expect(deps.createToast).not.toHaveBeenCalled()
    expect(deps.countUnseen).toHaveBeenCalled()
  })

  it('sistema sem suporte a notificação: registra e segue com a barra', () => {
    const win = fakeWindow()
    const { deps } = setup(win, false)
    handleNotify(payload, deps)
    expect(deps.log).toHaveBeenCalledWith('Notification.isSupported() = false')
    expect(deps.countUnseen).toHaveBeenCalled()
  })

  it('barra de tarefas desligada: não pisca nem conta', () => {
    const win = fakeWindow()
    const { deps } = setup(win)
    handleNotify({ ...payload, taskbar: false }, deps)
    expect(win.flashFrame).not.toHaveBeenCalled()
    expect(deps.countUnseen).not.toHaveBeenCalled()
  })
})
