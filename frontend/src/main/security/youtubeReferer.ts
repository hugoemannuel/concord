// O player do YouTube recusa tocar sem saber de que site veio ("erro 153"), e o
// app instalado roda em file://, que não manda Referer. Aqui o pedido ao player
// leva a origem do servidor do build (cada servidor próprio, o seu domínio).
// Quem já manda Referer (web, dev) segue como está.

const PLAYER_URLS = ['https://www.youtube-nocookie.com/*']

type Headers = Record<string, string>

/** O pedaço da Session que isto usa (testável sem Electron). */
export interface HeadersSession {
  webRequest: {
    onBeforeSendHeaders(
      filter: { urls: string[] },
      listener: (
        details: { requestHeaders: Headers },
        callback: (response: { requestHeaders: Headers }) => void
      ) => void
    ): void
  }
}

function firstOrigin(servers: readonly string[]): string | null {
  for (const raw of servers) {
    try {
      const url = new URL(raw)
      if (url.protocol === 'https:' || url.protocol === 'http:') return `${url.origin}/`
    } catch {
      // Endereço inválido: tenta o próximo.
    }
  }
  return null
}

const hasReferer = (headers: Headers): boolean => Object.keys(headers).some((k) => k.toLowerCase() === 'referer')

export function setupYouTubeReferer(ses: HeadersSession, servers: readonly string[]): void {
  const referer = firstOrigin(servers)
  if (!referer) return
  ses.webRequest.onBeforeSendHeaders({ urls: PLAYER_URLS }, ({ requestHeaders }, callback) => {
    callback({ requestHeaders: hasReferer(requestHeaders) ? requestHeaders : { ...requestHeaders, Referer: referer } })
  })
}
