import { useEffect, useState } from 'react'
import { getMemberGames, type ServerGame } from '../api/serverProfile'

/** "Seus membros jogam": os mais jogados, sem dizer quem jogou. */
export function useMemberGames(serverId: string): ServerGame[] {
  const [games, setGames] = useState<ServerGame[]>([])
  useEffect(() => {
    let cancelled = false
    getMemberGames(serverId)
      .then((next) => !cancelled && setGames(next))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [serverId])
  return games
}
