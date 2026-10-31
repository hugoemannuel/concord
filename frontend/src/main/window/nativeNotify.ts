import { taskbarAction } from './taskbarBadge'
import { notifyPlan } from './windowPolicy'

// Aviso nativo de DM, menção ou chamada (canal 'notify' do renderer): toast do
// sistema e, conforme as preferências, piscar + selo na barra de tarefas. O
// Electron entra pelas deps, para dar para testar sem ele.

export interface NotifyPayload {
  title: string
  body: string
  route: string
  urgent?: boolean
  /** "Notificações na área de trabalho" (padrão: ligada). */
  toast?: boolean
  /** "Mostrar na barra de tarefas": piscar + selo de não lidas (padrão: ligada). */
  taskbar?: boolean
  /** A conversa do aviso não está na tela: toast mesmo com a janela em foco. */
  elsewhere?: boolean
}

/** O pedaço da BrowserWindow que o aviso usa. */
export interface NotifyWindow {
  isDestroyed: () => boolean
  isVisible: () => boolean
  isFocused: () => boolean
  flashFrame: (flag: boolean) => void
}

export interface ToastOptions {
  title: string
  body: string
  icon: string
  silent: boolean
}

/** O pedaço da Notification do Electron que o aviso usa. */
export interface NativeToast {
  on(event: 'failed', listener: (event: unknown, error: string) => void): void
  on(event: 'click' | 'close', listener: () => void): void
  show: () => void
}

export interface NotifyDeps<W extends NotifyWindow> {
  window: () => W | null
  icon: string
  supported: () => boolean
  createToast: (options: ToastOptions) => NativeToast
  /** Abre a janela e leva à rota do aviso. */
  open: (win: W, route: string) => void
  /** Mais uma não lida no selo da barra de tarefas. */
  countUnseen: (win: W) => void
  log: (message: string) => void
}

/** Notificações vivas: sem referência o GC do Windows as coleta e o clique some. */
const activeToasts = new Set<NativeToast>()

/**
 * Sempre sem o som do sistema: o renderer toca o som que a pessoa escolheu
 * (Configurações → Notificações), então tocar o do Windows seria som dobrado.
 */
export function toastOptions(payload: NotifyPayload, icon: string): ToastOptions {
  return { title: payload.title, body: payload.body, icon, silent: true }
}

function showToast<W extends NotifyWindow>(win: W, payload: NotifyPayload, deps: NotifyDeps<W>): void {
  const toast = deps.createToast(toastOptions(payload, deps.icon))
  activeToasts.add(toast)
  toast.on('failed', (_event, error) => {
    activeToasts.delete(toast)
    deps.log(`notificação falhou: ${error}`)
  })
  toast.on('click', () => {
    activeToasts.delete(toast)
    deps.open(win, payload.route)
  })
  toast.on('close', () => activeToasts.delete(toast))
  toast.show()
}

/** Toast pedido e o sistema sabe mostrar (senão registra no log). */
function toastAllowed(payload: NotifyPayload, supported: () => boolean, log: (m: string) => void): boolean {
  const wants = payload.urgent || payload.toast !== false
  if (!wants) return false
  if (supported()) return true
  log('Notification.isSupported() = false')
  return false
}

function markTaskbar<W extends NotifyWindow>(win: W, payload: NotifyPayload, deps: NotifyDeps<W>): void {
  const action = taskbarAction(payload)
  if (action.flash) win.flashFrame(true)
  if (action.badge) deps.countUnseen(win)
}

export function handleNotify<W extends NotifyWindow>(payload: NotifyPayload, deps: NotifyDeps<W>): void {
  const win = deps.window()
  if (!win || win.isDestroyed()) return
  const plan = notifyPlan({ visible: win.isVisible(), focused: win.isFocused() }, payload)
  if (!plan.toast) return
  if (toastAllowed(payload, deps.supported, deps.log)) showToast(win, payload, deps)
  if (plan.taskbar) markTaskbar(win, payload, deps)
}
