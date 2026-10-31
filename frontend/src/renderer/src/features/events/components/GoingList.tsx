import { useEffect, useState } from 'react'
import { usePresenceActivityStore } from '../../activity/store/presenceActivityStore'
import { useChatStore } from '../../chat/store/chatStore'
import { fetchGoing, type EventGoing } from '../api/events'
import GoingPeople from './GoingPeople'

/** Quem vai na ocorrência atual; recarrega quando a contagem muda. */
export default function GoingList({
  serverId,
  eventId,
  occurrence,
  count,
  game,
  running
}: {
  serverId: string
  eventId: string
  occurrence: string
  count: number
  game: string | null
  running: boolean
}): React.JSX.Element | null {
  const [people, setPeople] = useState<EventGoing[]>([])
  const activity = usePresenceActivityStore((s) => s.byUser)

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

  // A atividade só importa para o selo: busca quando há jogo e o evento corre.
  useEffect(() => {
    if (!game || !running || people.length === 0) return
    void useChatStore.getState().fetchPresenceFor(people.map((p) => p.user_id))
  }, [game, running, people])

  const playing = Object.fromEntries(Object.entries(activity).map(([id, a]) => [id, a.name]))
  return <GoingPeople people={people} game={game} running={running} playing={playing} />
}
