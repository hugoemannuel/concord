import { useEffect, useRef, useState } from 'react'
import { fetchDirectLinks } from '../api/listeningLinks'
import { directLinksView, linksKey, loadDirectLinks, type LoadedLinks } from '../lib/directLinks'
import type { DirectLinks } from '../lib/listeningLinks'
import type { ListeningActivity } from '../lib/listeningActivity'

/** Pede os links diretos da faixa ao abrir o menu "Ouvir também" (lib/directLinks.ts). */
export function useDirectLinks({ title, artist }: ListeningActivity): {
  direct: DirectLinks
  loading: boolean
  whenReady: () => Promise<DirectLinks>
} {
  const [loaded, setLoaded] = useState<LoadedLinks | null>(null)
  const pending = useRef<Promise<DirectLinks>>(Promise.resolve({}))
  useEffect(() => loadDirectLinks(title, artist, fetchDirectLinks, pending, setLoaded), [title, artist])
  return { ...directLinksView(loaded, linksKey(title, artist)), whenReady: () => pending.current }
}
