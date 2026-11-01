import type { NotifyPayload } from './nativeNotify'

// Validação do que chega do renderer pelo IPC. O renderer não é confiável
// (um XSS manda qualquer coisa pela ponte): cada canal confere quem mandou e
// o formato do argumento antes de agir.

interface SenderEvent {
  sender: unknown
}

/** A mensagem veio da janela principal (não do overlay, nem de outra página)? */
export function fromWindow(
  event: SenderEvent,
  getWindow: () => { webContents: unknown } | null
): boolean {
  const win = getWindow()
  return win !== null && event.sender === win.webContents
}

export function parseBoolean(raw: unknown): boolean | null {
  return typeof raw === 'boolean' ? raw : null
}

function isRecord(raw: unknown): raw is Record<string, unknown> {
  return typeof raw === 'object' && raw !== null
}

export function parseCallState(raw: unknown): { inCall: boolean; muted: boolean } | null {
  if (!isRecord(raw)) return null
  const inCall = parseBoolean(raw.inCall)
  const muted = parseBoolean(raw.muted)
  return inCall === null || muted === null ? null : { inCall, muted }
}

/**
 * Posição do arraste manual da janela (ver windowDrag.ts): x/y sem limites, de
 * propósito — o ponto pode cair em qualquer monitor, não só no principal.
 */
export function parsePoint(raw: unknown): { x: number; y: number } | null {
  if (!isRecord(raw)) return null
  const { x, y } = raw
  if (typeof x !== 'number' || typeof y !== 'number') return null
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return { x, y }
}

const SOURCE_ID = /^(screen|window):[\w.-]+(:[\w.-]+)*$/

/** Id de fonte do desktopCapturer ("screen:0:0", "window:123:0"). */
export function parseSourceId(raw: unknown): string | null {
  return typeof raw === 'string' && raw.length <= 200 && SOURCE_ID.test(raw) ? raw : null
}

const NOTIFY_FLAGS = ['urgent', 'toast', 'taskbar', 'elsewhere'] as const

function notifyFlagsValid(raw: Record<string, unknown>): boolean {
  return NOTIFY_FLAGS.every((key) => raw[key] === undefined || typeof raw[key] === 'boolean')
}

/** Rota interna do app ("/canal/..."), nunca um endereço de fora. */
function isAppRoute(raw: unknown): raw is string {
  return typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//')
}

export function parseNotifyPayload(raw: unknown): NotifyPayload | null {
  if (!isRecord(raw) || typeof raw.title !== 'string' || typeof raw.body !== 'string') return null
  if (!isAppRoute(raw.route) || !notifyFlagsValid(raw)) return null
  const payload: NotifyPayload = {
    title: raw.title.slice(0, 200),
    body: raw.body.slice(0, 1000),
    route: raw.route
  }
  for (const key of NOTIFY_FLAGS) if (raw[key] !== undefined) payload[key] = raw[key] as boolean
  return payload
}
