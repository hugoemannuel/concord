// Quem pode pedir o quê ao Chromium (câmera, microfone, notificação...). Sem
// handler, o Electron concede tudo para qualquer página. Aqui: só o próprio app
// (renderer empacotado, servidor de dev, servidor configurado) e só o que ele
// usa. Puro para testar; a ligação com as sessões fica em sessionPermissions.ts.

/** De onde vem o app: a pasta do renderer (file://…/) e as origens http(s). */
export interface AppOrigins {
  /** URL da pasta do renderer empacotado, terminando em '/'; null = sem arquivo local. */
  fileRoot: string | null
  /** Origens exatas (esquema + host + porta): servidor de dev e servidores do build. */
  origins: readonly string[]
}

/** O que o app usa: voz/vídeo, captura de tela, notificação, copiar, tela cheia, saída de som. */
export const APP_PERMISSIONS: ReadonlySet<string> = new Set([
  'media',
  'display-capture',
  'notifications',
  'clipboard-sanitized-write',
  'fullscreen',
  'speaker-selection'
])

/**
 * Iframe de atividade (jogo) dentro da página do app: só o que o allow= do
 * iframe delega e que não expõe nada da pessoa.
 */
const EMBED_PERMISSIONS: ReadonlySet<string> = new Set(['fullscreen', 'pointerLock'])

export interface PermissionRequest {
  /** URL de quem pede (o quadro). */
  requestingUrl?: string
  /** URL da página que contém o quadro, quando é um iframe. */
  embeddingUrl?: string
  isMainFrame?: boolean
}

function parse(raw: string | undefined): URL | null {
  if (!raw) return null
  try {
    return new URL(raw)
  } catch {
    return null
  }
}

/** A URL é do próprio app? Arquivo só dentro da pasta do renderer; http(s) pela origem exata. */
export function isAppUrl(raw: string | undefined, app: AppOrigins): boolean {
  const url = parse(raw)
  if (!url) return false
  if (url.protocol === 'file:') return !!app.fileRoot && url.href.startsWith(app.fileRoot)
  return app.origins.includes(url.origin)
}

export function permissionAllowed(
  permission: string,
  request: PermissionRequest,
  app: AppOrigins
): boolean {
  if (isAppUrl(request.requestingUrl, app)) return APP_PERMISSIONS.has(permission)
  return (
    request.isMainFrame === false &&
    EMBED_PERMISSIONS.has(permission) &&
    isAppUrl(request.embeddingUrl, app)
  )
}
