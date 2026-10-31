import { withDirectLinks, type DirectLinks, type ListeningLink, type ServiceKey } from './listeningLinks'

// Clique em "Ouvir no X" antes de os links diretos chegarem: espera um pouco
// (a busca no YouTube leva ~3 s na 1ª vez; depois vem do cache) e abre a faixa;
// passou do tempo ou falhou, abre a busca. Puro (o open vem de fora).

/** Quanto o clique espera pelos links diretos antes de abrir a busca. */
export const DIRECT_WAIT_MS = 3000

export function waitDirectLinks(pending: Promise<DirectLinks>, ms = DIRECT_WAIT_MS): Promise<DirectLinks> {
  const timeout = new Promise<DirectLinks>((resolve) => setTimeout(() => resolve({}), ms))
  return Promise.race([pending.catch(() => ({})), timeout])
}

export async function openListeningLink(
  key: ServiceKey,
  links: ListeningLink[],
  pending: Promise<DirectLinks>,
  open: (url: string) => void
): Promise<void> {
  const direct = await waitDirectLinks(pending)
  const link = withDirectLinks(links, direct).find((l) => l.key === key)
  if (link) open(link.url)
}

/** A resposta dos links diretos de uma faixa (key = linksKey). */
export interface LoadedLinks {
  key: string
  direct: DirectLinks
}

export function linksKey(title: string, artist?: string): string {
  return `${artist ?? ''}\n${title}`
}

/**
 * Pede os links diretos (useDirectLinks, ao abrir o menu). pending guarda a
 * busca em andamento (nunca rejeita) para o clique esperar; o retorno cancela
 * a entrega (menu fechado ou outra faixa).
 */
export function loadDirectLinks(
  title: string,
  artist: string | undefined,
  fetch: (title: string, artist?: string) => Promise<DirectLinks>,
  pending: { current: Promise<DirectLinks> },
  done: (loaded: LoadedLinks) => void
): () => void {
  let alive = true
  const request = fetch(title, artist).catch((): DirectLinks => ({}))
  pending.current = request
  void request.then((direct) => {
    if (alive) done({ key: linksKey(title, artist), direct })
  })
  return () => {
    alive = false
  }
}

/** O que o menu mostra: links diretos da faixa atual, ou carregando. */
export function directLinksView(
  loaded: LoadedLinks | null,
  key: string
): { direct: DirectLinks; loading: boolean } {
  return loaded?.key === key ? { direct: loaded.direct, loading: false } : { direct: {}, loading: true }
}
