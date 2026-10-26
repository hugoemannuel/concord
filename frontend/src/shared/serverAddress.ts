// Endereço do servidor escolhido na tela inicial (build genérico): igual no
// main (salva e confere) e no renderer (campo "Endereço do servidor").

export type ServerAddressResult = { ok: true; url: string } | { ok: false; error: string }

/**
 * Normaliza o que a pessoa digitou: sem esquema vira http://, fica só a origem
 * (o app monta /api, /ws e /rtc a partir dela) e só http/https com host.
 */
export function normalizeServerAddress(input: string): ServerAddressResult {
  const raw = input.trim()
  if (!raw) return { ok: false, error: 'Informe o endereço do servidor.' }
  let url: URL
  try {
    url = new URL(raw.includes('://') ? raw : `http://${raw}`)
  } catch {
    return { ok: false, error: 'Endereço inválido.' }
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, error: 'Use um endereço http:// ou https://.' }
  }
  if (!url.hostname || url.username || url.password) {
    return { ok: false, error: 'Endereço inválido.' }
  }
  return { ok: true, url: url.origin }
}

/** Resposta da conferência do endereço (main → tela inicial). */
export type ProbeResult = { ok: true; serverVersion: string | null } | { ok: false; error: string }

/** Servidor desta execução; `fixed` = embutido no build (não dá para trocar). */
export interface ServerInfo {
  url: string | null
  fixed: boolean
}

/** O main passa o servidor ao preload por argumento da janela (additionalArguments). */
export const SERVER_ARG = '--salinha-server='

export function serverUrlFromArgv(argv: readonly string[]): string | undefined {
  const arg = argv.find((a) => a.startsWith(SERVER_ARG))
  const value = arg?.slice(SERVER_ARG.length)
  return value || undefined
}
