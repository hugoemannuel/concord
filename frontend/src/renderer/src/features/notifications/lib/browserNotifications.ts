import type { DesktopPayload } from './notifications'
import { browserNotificationOptions, type WebPermission } from './webNotifications'

// Acesso à Notification API do navegador (build web), sem quebrar onde ela
// não existe.

export function browserPermission(): WebPermission {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
}

/** Pede a permissão (precisa vir de um clique). Devolve o resultado. */
export async function requestBrowserPermission(): Promise<WebPermission> {
  if (typeof Notification === 'undefined') return 'unsupported'
  try {
    return await Notification.requestPermission()
  } catch {
    return browserPermission()
  }
}

/** Mostra o aviso do navegador; o clique chama onClick e fecha o aviso. */
export function showBrowserNotification(
  payload: DesktopPayload,
  icon: string,
  onClick: () => void
): void {
  try {
    const notification = new Notification(payload.title, browserNotificationOptions(payload, icon))
    notification.onclick = () => {
      onClick()
      notification.close()
    }
  } catch {
    // Navegador que só notifica via service worker (ex.: Chrome no Android).
  }
}
