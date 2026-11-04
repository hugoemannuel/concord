import { useEffect, useState } from 'react'
import { getInviteCard, getServerCard, type ServerCard } from '../api/serverProfile'

export type CardState =
  | { status: 'loading' }
  | { status: 'ready'; card: ServerCard }
  | { status: 'error' }

type Loaded = Exclude<CardState, { status: 'loading' }> & { key: string }

function useCardRequest(key: string | null, fetch: () => Promise<ServerCard>): CardState {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  useEffect(() => {
    if (!key) return
    let cancelled = false
    fetch()
      .then((card) => !cancelled && setLoaded({ key, status: 'ready', card }))
      .catch(() => !cancelled && setLoaded({ key, status: 'error' }))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` identifica o pedido.
  }, [key])
  return loaded && loaded.key === key ? loaded : { status: 'loading' }
}

/** O cartão como esta pessoa pode ver (trancado, se o perfil é privado). */
export function useServerCard(serverId: string | null): CardState {
  return useCardRequest(serverId, () => getServerCard(serverId as string))
}

/** O cartão da prévia do link de convite. */
export function useInviteCard(code: string | undefined, signedIn: boolean): CardState {
  return useCardRequest(code ?? null, () => getInviteCard(code as string, signedIn))
}
