/**
 * Links de convite: https://app-salinha.bhrx.com.br/convite/<código> (abre no
 * navegador) e salinha://convite/<código> (abre o app). Puro: o processo main
 * também usa (args do protocolo salinha://).
 */

/** Onde o app web mora (o link de convite abre aqui). */
export const INVITE_WEB_ORIGIN = 'https://app-salinha.bhrx.com.br'

/** Protocolo que o app desktop registra no sistema. */
export const INVITE_PROTOCOL = 'salinha'

/** Página de download do app (quando o salinha:// não abre nada). */
export const DOWNLOAD_URL = 'https://salinha.bhrx.com.br'

// Mesmo formato que o backend aceita (validInviteCode), já normalizado.
const CODE = /^[A-Z0-9]{4,16}$/
// Estrito de propósito: o link vem de fora (qualquer site pode abrir). Só
// letras e números no código; nada de query, fragmento, usuário ou porta. A
// barra final é tolerada: o Windows às vezes acrescenta.
const DEEP_LINK = /^salinha:\/\/convite\/([A-Za-z0-9]{4,16})\/?$/i
const WEB_PATH = /^\/convite\/([A-Za-z0-9]{4,16})\/?$/

/** origin: o app web de outro servidor (servidor próprio) passa o endereço dele. */
export function inviteLink(code: string, origin: string = INVITE_WEB_ORIGIN): string {
  return `${origin}/convite/${code}`
}

export function inviteDeepLink(code: string): string {
  return `${INVITE_PROTOCOL}://convite/${code}`
}

/** Código como as pessoas digitam (minúsculas, espaços, hífens); null se não é código. */
export function normalizeInviteCode(input: string): string | null {
  const code = input.replace(/[\s-]/g, '').toUpperCase()
  return CODE.test(code) ? code : null
}

/** salinha://convite/<código> → código; qualquer outra coisa, null. */
export function parseInviteDeepLink(url: string): string | null {
  if (url.length > 64) return null
  const match = DEEP_LINK.exec(url)
  return match ? match[1].toUpperCase() : null
}

/** O link de convite entre os args do processo (partida a frio ou segunda instância). */
export function findInviteDeepLink(argv: readonly string[]): string | null {
  for (const arg of argv) {
    const code = parseInviteDeepLink(arg)
    if (code) return code
  }
  return null
}

/** O que a pessoa colou em "Entrar com código": código, link do navegador ou do app. */
export function parseInviteInput(input: string): string | null {
  const text = input.trim()
  if (!text) return null
  const fromDeepLink = parseInviteDeepLink(text)
  if (fromDeepLink) return fromDeepLink
  if (text.includes('/convite/')) {
    let url: URL
    try {
      url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`)
    } catch {
      return null
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    const match = WEB_PATH.exec(url.pathname)
    return match ? match[1].toUpperCase() : null
  }
  return normalizeInviteCode(text)
}

/**
 * Link de convite HTTP(S) que é nosso (clicado dentro do app) → código. Só os
 * nossos endereços: o do app web, o do site de download e as origens extras
 * (o servidor do build, ex.: o PUBLIC_URL sslip.io; no navegador, a própria
 * origem da página). Caminho exatamente /convite/<código>; query e fragmento
 * são ignorados, mas usuário/senha e outras portas não passam. Qualquer outro
 * link devolve null e segue o caminho normal (navegador de fora).
 */
export function parseOwnInviteUrl(
  raw: string,
  extraOrigins: readonly (string | undefined)[] = []
): string | null {
  if (raw.length > 2048) return null
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  if (url.username || url.password) return null
  const allowed = new Set<string>([new URL(INVITE_WEB_ORIGIN).origin, new URL(DOWNLOAD_URL).origin])
  for (const extra of extraOrigins) {
    if (!extra?.trim()) continue
    try {
      const origin = new URL(extra).origin
      if (origin !== 'null') allowed.add(origin)
    } catch {
      // origem extra inválida (config errada): ignora
    }
  }
  if (!allowed.has(url.origin)) return null
  const match = WEB_PATH.exec(url.pathname)
  return match ? match[1].toUpperCase() : null
}

/** Código guardado em ?convite= (login e cadastro, para voltar ao convite). */
export function inviteCodeFromSearch(search: string): string | null {
  const raw = new URLSearchParams(search).get('convite')
  return raw ? normalizeInviteCode(raw) : null
}

export function authPathWithInvite(path: '/login' | '/register', code: string | null): string {
  return code ? `${path}?convite=${code}` : path
}
