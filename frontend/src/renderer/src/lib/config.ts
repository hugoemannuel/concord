import { appTarget } from './platform'
import { resolveServerUrls } from './serverUrl'

/** Build web (navegador, yarn build:web) — sem Electron nem window.api. */
export const IS_WEB = appTarget(import.meta.env.VITE_APP_TARGET) === 'web'

// Desktop: o servidor que o main decidiu no boot (embutido no build oficial ou
// escolhido na tela inicial do build genérico), entregue pelo preload.
const desktopServer = typeof window !== 'undefined' ? window.api?.server : undefined

/** Build genérico sem servidor escolhido: o app abre a tela inicial. */
export const NEEDS_SERVER = !IS_WEB && desktopServer !== undefined && !desktopServer.url

// Desktop: endereço do servidor (sem ele, o backend local do dev). Navegador:
// a própria origem da página.
export const {
  apiBaseUrl: API_BASE_URL,
  wsUrl: WS_URL,
  liveKitUrl: LIVEKIT_URL
} = resolveServerUrls({
  web: IS_WEB,
  serverUrl: desktopServer?.url ?? import.meta.env.VITE_SERVER_URL,
  pageOrigin: typeof location !== 'undefined' ? location.origin : undefined
})

/** Endereço do servidor para mostrar (Configurações → Servidor). */
export const SERVER_URL = IS_WEB ? null : (desktopServer?.url ?? null)
