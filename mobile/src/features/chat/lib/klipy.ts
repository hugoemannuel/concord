import type { GifItem } from '../api/gifs'

/**
 * KLIPY (docs/adr/0053): o app chama a API da KLIPY direto, como ela exige.
 * Aqui só a parte pura: montar a URL e converter a resposta.
 */

/** O que o servidor entrega em GET /gifs/config. */
export interface GifsConfig {
  provider: string
  app_key: string
  customer_id: string
  locale: string
  content_filter: string
  format_filter: string
}

export const KLIPY_API = 'https://api.klipy.com'
const MIN_PER_PAGE = 8
const MAX_PER_PAGE = 50

/** per_page entre 8 e 50 (limites da KLIPY) e a página que o offset pede. */
export function pageOf(limit: number, offset: number): { perPage: number; page: number } {
  const perPage = Math.min(Math.max(limit > 0 ? limit : 25, MIN_PER_PAGE), MAX_PER_PAGE)
  return { perPage, page: Math.floor(Math.max(offset, 0) / perPage) + 1 }
}

/** GET api/v1/{app_key}/gifs/{trending|search}: a chave vai no caminho; sem `q` é "em alta". */
export function klipyUrl(config: GifsConfig, limit: number, offset: number, q = ''): string {
  const { perPage, page } = pageOf(limit, offset)
  const params = new URLSearchParams({
    page: String(page),
    per_page: String(perPage),
    customer_id: config.customer_id,
    locale: config.locale,
    content_filter: config.content_filter,
    format_filter: config.format_filter
  })
  if (q) params.set('q', q)
  const route = q ? 'search' : 'trending'
  return `${KLIPY_API}/api/v1/${encodeURIComponent(config.app_key)}/gifs/${route}?${params.toString()}`
}

/** Hosts de mídia aceitos por provedor (GIPHY fica para mensagens e favoritos antigos). */
export function providerOfUrl(raw: string): 'giphy' | 'klipy' | '' {
  try {
    const u = new URL(raw)
    if (u.protocol !== 'https:') return ''
    const isDomain = (d: string): boolean => u.hostname === d || u.hostname.endsWith(`.${d}`)
    if (isDomain('giphy.com')) return 'giphy'
    if (isDomain('klipy.com')) return 'klipy'
  } catch {
    // URL inválida: sem provedor
  }
  return ''
}

/** A KLIPY serve `/ii/<hash de 32 hex>/<x>/<y>/<arquivo>`: o hash identifica o GIF em todos os tamanhos. */
export function klipyIdFromUrl(raw: string): string {
  try {
    const u = new URL(raw)
    if (providerOfUrl(raw) !== 'klipy') return ''
    return /^\/[^/]+\/([0-9a-f]{32})\//.exec(u.pathname)?.[1] ?? ''
  } catch {
    return ''
  }
}

interface KlipyFile {
  url?: string
  width?: number
  height?: number
}
interface KlipyEntry {
  id?: number | string
  slug?: string
  title?: string
  file?: Record<string, Record<string, KlipyFile | undefined> | undefined>
}
export interface KlipyResponse {
  result?: boolean
  data?: { data?: KlipyEntry[] }
}

function gifFile(entry: KlipyEntry, sizes: string[]): KlipyFile | null {
  for (const size of sizes) {
    const f = entry.file?.[size]?.gif
    if (f?.url) return f
  }
  return null
}

/**
 * A resposta da KLIPY no formato do seletor: URL no tamanho médio, prévia no
 * pequeno. Mantém a ordem e as URLs como vieram (a KLIPY exige) e só deixa
 * passar mídia da própria KLIPY.
 */
export function mapKlipyItems(body: KlipyResponse): GifItem[] {
  const items: GifItem[] = []
  for (const entry of body.data?.data ?? []) {
    const main = gifFile(entry, ['md', 'hd', 'sm', 'xs'])
    if (!main?.url || providerOfUrl(main.url) !== 'klipy') continue
    const small = gifFile(entry, ['sm', 'xs', 'md'])
    const preview = small?.url && providerOfUrl(small.url) === 'klipy' ? small.url : main.url
    items.push({
      id: klipyIdFromUrl(main.url) || entry.slug || String(entry.id ?? ''),
      title: entry.title ?? '',
      url: main.url,
      preview_url: preview,
      width: main.width ?? 0,
      height: main.height ?? 0,
      provider: 'klipy'
    })
  }
  return items
}
