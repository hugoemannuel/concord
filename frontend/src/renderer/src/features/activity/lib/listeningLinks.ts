import type { ListeningActivity } from './listeningActivity'

// "Ouvir também": links nos serviços de música a partir da faixa que a pessoa
// está ouvindo. A atividade só guarda app, título, artista e álbum (sem URL nem
// ID da faixa): o ponto de partida é a busca por "artista - título", trocada
// pelo link direto da faixa quando o servidor acha (GET /music/links). Puro.

/** Igual ao limite do servidor para a busca do Maestro (music.queryMax). */
const QUERY_MAX = 200

/** Chave do serviço na resposta do GET /music/links. */
export type ServiceKey = 'youtube' | 'spotify' | 'youtube_music' | 'deezer' | 'apple_music'

/** Links diretos que o servidor achou; serviço ausente = fica a busca. */
export type DirectLinks = Partial<Record<ServiceKey, string>>

export interface ListeningLink {
  key: ServiceKey
  /** Nome do serviço ("YouTube Music"); é também o nome no catálogo de players (ícone e cor). */
  label: string
  /** Busca no serviço ou a faixa direto; sempre https. */
  url: string
}

const SERVICES: readonly { key: ServiceKey; label: string; search: (q: string) => string }[] = [
  { key: 'youtube', label: 'YouTube', search: (q) => `https://www.youtube.com/results?search_query=${q}` },
  { key: 'spotify', label: 'Spotify', search: (q) => `https://open.spotify.com/search/${q}` },
  { key: 'youtube_music', label: 'YouTube Music', search: (q) => `https://music.youtube.com/search?q=${q}` },
  { key: 'deezer', label: 'Deezer', search: (q) => `https://www.deezer.com/search/${q}` },
  { key: 'apple_music', label: 'Apple Music', search: (q) => `https://music.apple.com/search?term=${q}` }
]

/** "Elis Regina - Águas de Março"; sem artista, só o título. */
export function listeningQuery(listening: ListeningActivity): string {
  const title = listening.title.trim()
  const artist = listening.artist?.trim()
  return (artist ? `${artist} - ${title}` : title).slice(0, QUERY_MAX)
}

export function listeningLinks(listening: ListeningActivity): ListeningLink[] {
  const q = encodeURIComponent(listeningQuery(listening))
  return SERVICES.map((s) => ({ key: s.key, label: s.label, url: s.search(q) }))
}

/** Troca a busca pelo link direto de cada serviço que veio (só https). */
export function withDirectLinks(links: ListeningLink[], direct: DirectLinks): ListeningLink[] {
  return links.map((link) => {
    const url = direct[link.key]
    return url?.startsWith('https://') ? { ...link, url } : link
  })
}
