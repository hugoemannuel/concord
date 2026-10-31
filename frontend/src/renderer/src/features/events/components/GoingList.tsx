import { useEffect, useState } from 'react'
import { fetchGoing, type EventGoing } from '../api/events'

/** Quem vai na ocorrência atual; recarrega quando a contagem muda. */
export default function GoingList({
  serverId,
  eventId,
  occurrence,
  count
}: {
  serverId: string
  eventId: string
  occurrence: string
  count: number
}): React.JSX.Element | null {
  const [people, setPeople] = useState<EventGoing[]>([])

  useEffect(() => {
    if (count === 0) {
      setPeople([])
      return
    }
    let alive = true
    fetchGoing(serverId, eventId)
      .then((list) => alive && setPeople(list))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [serverId, eventId, occurrence, count])

  if (people.length === 0) return null
  return (
    <ul aria-label="Quem vai" className="flex flex-wrap gap-2">
      {people.map((p) => (
        <li key={p.user_id} className="max-w-full truncate rounded-md bg-fg/5 px-2.5 py-1 text-ds-xs text-normal">
          {p.display_name || p.username}
        </li>
      ))}
    </ul>
  )
}
