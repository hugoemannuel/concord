import type { DesktopPayload } from './notifications'

// Notificações no navegador (build web): o que no desktop o processo main faz
// com o toast do Windows e o selo da barra de tarefas, aqui vira a Web
// Notification API e o número de não lidas no título da aba. Puro para testar.

/** Permissão de notificação do navegador; 'unsupported' = sem a API. */
export type WebPermission = NotificationPermission | 'unsupported'

export interface PageState {
  /** document.visibilityState === 'visible' */
  visible: boolean
  /** document.hasFocus() */
  focused: boolean
}

/**
 * Para um aviso pedido pelo app: mostrar a notificação do navegador e/ou
 * contar uma não lida no título. Como no desktop: com a aba em foco, só o
 * aviso e só se a conversa não está na tela (`elsewhere`), sem contar no
 * título (ele só é limpo ao voltar para a aba); chamada recebida avisa mas
 * não conta.
 */
export function webNotificationAction(
  payload: DesktopPayload,
  permission: WebPermission,
  page: PageState
): { show: boolean; countUnread: boolean } {
  if (page.visible && page.focused) {
    return {
      show: payload.elsewhere === true && payload.toast && permission === 'granted',
      countUnread: false
    }
  }
  return {
    show: payload.toast && permission === 'granted',
    countUnread: payload.taskbar && !payload.urgent
  }
}

/** Título da aba com as não lidas na frente: "(3) Salinha". */
export function titleWithUnread(base: string, count: number): string {
  return count > 0 ? `(${count}) ${base}` : base
}

/** O que Configurações → Notificações mostra sobre a permissão do navegador. */
export function permissionView(permission: WebPermission): {
  status: string
  canRequest: boolean
} {
  switch (permission) {
    case 'granted':
      return { status: 'Permitidas neste navegador.', canRequest: false }
    case 'denied':
      return {
        status: 'Bloqueadas pelo navegador. Para liberar, use o ícone ao lado do endereço do site.',
        canRequest: false
      }
    case 'unsupported':
      return { status: 'Este navegador não mostra notificações.', canRequest: false }
    default:
      return {
        status: 'O navegador ainda não deixou a Salinha mostrar avisos.',
        canRequest: true
      }
  }
}

/**
 * Opções do aviso do navegador: chamada fica na tela até atender ou fechar.
 * Sem o som do sistema: o app toca o som escolhido (som dobrado, não).
 */
export function browserNotificationOptions(payload: DesktopPayload, icon: string): NotificationOptions {
  return { body: payload.body, icon, requireInteraction: payload.urgent === true, silent: true }
}
