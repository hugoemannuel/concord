// Funções puras sobre o endereço do servidor. Usadas pelo renderer (config.ts)
// e pelo build (electron.vite.config.ts, para gerar a CSP) — sem import.meta.

export const DEFAULT_SERVER_URL = 'http://localhost:8080'

export interface ServerUrls {
  apiBaseUrl: string
  wsUrl: string
  /**
   * O livekit-client acrescenta /rtc sozinho. Na VPS o Caddy manda /rtc direto
   * para o LiveKit; sem Caddy (PC de casa), o backend repassa.
   */
  liveKitUrl: string
}

function normalize(serverUrl: string | undefined): URL {
  return new URL(serverUrl?.trim() || DEFAULT_SERVER_URL)
}

function toWsOrigin(url: URL): string {
  return `${url.protocol === 'https:' ? 'wss:' : 'ws:'}//${url.host}`
}

export function deriveServerUrls(serverUrl: string | undefined): ServerUrls {
  const url = normalize(serverUrl)
  const wsOrigin = toWsOrigin(url)
  return {
    apiBaseUrl: `${url.origin}/api`,
    wsUrl: `${wsOrigin}/ws`,
    liveKitUrl: wsOrigin
  }
}

function originOf(raw: string): string | null {
  try {
    const url = new URL(raw)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : null
  } catch {
    return null
  }
}

/**
 * Endereços do desktop em ordem de preferência: o do build (VITE_SERVER_URL)
 * e os alternativos (VITE_SERVER_FALLBACK_URLS, separados por vírgula ou
 * espaço). Ao abrir, o app usa o primeiro que responde: um domínio bloqueado
 * na rede de alguém (DNS, antivírus) não deixa o app inteiro sem conexão.
 * Sem o do build (dev): vazio, e fica o localhost.
 */
export function serverCandidates(primary: string | undefined, fallbacks: string | undefined): string[] {
  if (!primary?.trim()) return []
  const raw = [primary.trim(), ...(fallbacks ?? '').split(/[\s,]+/)]
  const origins = raw.map(originOf).filter((o): o is string => o !== null)
  return [...new Set(origins)]
}

/**
 * API de GIFs (KLIPY): o app a chama direto, como ela exige (docs/adr/0053).
 * As imagens vêm de static*.klipy.com e já cabem no `img-src` (https:).
 */
export const GIF_API_ORIGIN = 'https://api.klipy.com'

/** Valor do `connect-src` da CSP para o servidor configurado (e os alternativos). */
export function buildConnectSrc(serverUrl: string | undefined, fallbacks: string[] = []): string {
  const urls = [normalize(serverUrl), ...fallbacks.map((f) => new URL(f))]
  return `'self' ${urls.map((url) => `${url.origin} ${toWsOrigin(url)}`).join(' ')} ${GIF_API_ORIGIN}`
}

/**
 * Valor do `media-src` (e parte do `img-src`) da CSP: arquivos do chat vêm do
 * servidor e as prévias locais do campo de envio são URLs `blob:`.
 */
export function buildMediaSrc(serverUrl: string | undefined, fallbacks: string[] = []): string {
  const origins = [normalize(serverUrl).origin, ...fallbacks.map((f) => new URL(f).origin)]
  return `'self' blob: ${origins.join(' ')}`
}

export interface ResolveOptions {
  /** Build web (navegador): o backend está na mesma origem da página. */
  web: boolean
  /** VITE_SERVER_URL do build desktop (ignorado no web). */
  serverUrl?: string
  /** location.origin da página (só usado no web). */
  pageOrigin?: string
}

/**
 * Endereços que o app usa. Desktop: o servidor embutido no build. Navegador:
 * a mesma origem da página — API relativa e WebSocket/LiveKit em ws(s) do
 * mesmo host (https → wss, sem conteúdo misto).
 */
export function resolveServerUrls({ web, serverUrl, pageOrigin }: ResolveOptions): ServerUrls {
  if (!web) return deriveServerUrls(serverUrl)
  const wsOrigin = toWsOrigin(normalize(pageOrigin))
  return {
    apiBaseUrl: '/api',
    wsUrl: `${wsOrigin}/ws`,
    liveKitUrl: wsOrigin
  }
}

/**
 * `connect-src` do build web. `'self'` já cobre o ws(s) da mesma origem nos
 * navegadores atuais; o wss do endereço público entra explícito para os que
 * ainda não tratam assim.
 */
export function buildWebConnectSrc(publicUrl: string | undefined): string {
  const url = publicUrl?.trim()
  return url ? `'self' ${toWsOrigin(new URL(url))} ${GIF_API_ORIGIN}` : `'self' ${GIF_API_ORIGIN}`
}

/** `media-src` do build web: arquivos do chat na própria origem e prévias `blob:`. */
export function buildWebMediaSrc(): string {
  return "'self' blob:"
}

/**
 * Diretivas que só o build web acrescenta à CSP (o desktop fica como está).
 * O frame-src (plugins e atividades, sempre https) já vem no index.html, nos dois apps.
 */
export const WEB_EXTRA_CSP = "base-uri 'self'"

/** Preenche os marcadores da CSP do index.html; `extra` vem depois do connect-src. */
export function fillCsp(
  html: string,
  { connectSrc, mediaSrc, extra }: { connectSrc: string; mediaSrc: string; extra?: string }
): string {
  return html
    .replace('%CONCORD_CONNECT_SRC%', extra ? `${connectSrc}; ${extra}` : connectSrc)
    .replaceAll('%CONCORD_MEDIA_SRC%', mediaSrc)
}
