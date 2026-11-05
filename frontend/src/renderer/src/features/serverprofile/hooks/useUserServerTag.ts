import { useEffect } from 'react'
import type { ServerTag } from '../api/serverProfile'
import { useServerTagStore } from '../store/serverTagStore'

/** A tag que a pessoa usa (null = nenhuma, ou ainda não chegou). */
export function useUserServerTag(userId: string | undefined): ServerTag | null {
  const tag = useServerTagStore((s) => (userId ? (s.byUser[userId]?.tag ?? null) : null))
  useEffect(() => {
    if (userId) useServerTagStore.getState().request(userId)
  }, [userId])
  return tag
}
