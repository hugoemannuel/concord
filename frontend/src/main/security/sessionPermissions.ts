import { pathToFileURL } from 'node:url'
import { permissionAllowed, type AppOrigins, type PermissionRequest } from './permissionPolicy'

// Liga a regra de permissionPolicy.ts às sessões do Electron: a padrão e toda
// sessão criada depois (as atividades trocam pelo próprio handler, mas o de
// dispositivos continua negando). Sem isto o Electron concede tudo.

interface PageContents {
  getURL(): string
}

type RequestHandler = (
  contents: PageContents,
  permission: string,
  callback: (granted: boolean) => void,
  details: { requestingUrl?: string; isMainFrame?: boolean }
) => void

type CheckHandler = (
  contents: PageContents | null,
  permission: string,
  requestingOrigin: string,
  details: { requestingUrl?: string; isMainFrame?: boolean }
) => boolean

/** O pedaço da Session que a regra usa (testável sem Electron). */
export interface PermissionSession {
  setPermissionRequestHandler(handler: RequestHandler): void
  setPermissionCheckHandler(handler: CheckHandler): void
  setDevicePermissionHandler(handler: () => boolean): void
}

function originOf(raw: string | undefined): string | null {
  try {
    const url = new URL(raw ?? '')
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : null
  } catch {
    return null
  }
}

/** Pasta do renderer, servidor de dev (só no dev) e servidores do build. */
export function appOrigins(
  rendererDir: string,
  devUrl: string | undefined,
  servers: readonly string[]
): AppOrigins {
  const origins = [devUrl, ...servers].map(originOf).filter((o): o is string => !!o)
  return { fileRoot: `${pathToFileURL(rendererDir).href}/`, origins }
}

/**
 * A conferência às vezes traz só a origem (file:// não diz a pasta): aí vale a
 * página da janela, que o navigationGuard mantém dentro do app.
 */
function checkRequest(
  contents: PageContents | null,
  requestingOrigin: string,
  details: { requestingUrl?: string; isMainFrame?: boolean }
): PermissionRequest {
  const top = contents?.getURL()
  const requestingUrl = details.requestingUrl || (top && details.isMainFrame ? top : requestingOrigin)
  return { requestingUrl, embeddingUrl: top, isMainFrame: details.isMainFrame }
}

export function applyPermissionPolicy(ses: PermissionSession, app: AppOrigins): void {
  ses.setPermissionRequestHandler((contents, permission, callback, details) => {
    const request = { ...details, embeddingUrl: contents.getURL() }
    callback(permissionAllowed(permission, request, app))
  })
  ses.setPermissionCheckHandler((contents, permission, requestingOrigin, details) =>
    permissionAllowed(permission, checkRequest(contents, requestingOrigin, details), app)
  )
  // USB, HID e serial: o app não usa; nenhuma página escolhe dispositivo.
  ses.setDevicePermissionHandler(() => false)
}

/** Sessão padrão agora; qualquer sessão criada depois, ao nascer. */
export function setupSessionPermissions(
  app: { on(event: 'session-created', listener: (ses: PermissionSession) => void): unknown },
  defaultSession: PermissionSession,
  origins: AppOrigins
): void {
  applyPermissionPolicy(defaultSession, origins)
  app.on('session-created', (ses) => applyPermissionPolicy(ses, origins))
}
