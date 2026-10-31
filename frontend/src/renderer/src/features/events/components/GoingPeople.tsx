import type { EventGoing } from '../api/events'
import { isPlayingGame } from '../lib/eventGame'

/**
 * Quem vai. Com o evento em andamento, quem está jogando o jogo do evento
 * ganha o selo "Jogando" (`playing` = nome do jogo de cada pessoa).
 */
export default function GoingPeople({
  people,
  game,
  running,
  playing
}: {
  people: EventGoing[]
  game: string | null
  running: boolean
  playing: Record<string, string | undefined>
}): React.JSX.Element | null {
  if (people.length === 0) return null
  return (
    <ul aria-label="Quem vai" className="flex flex-wrap gap-2">
      {people.map((p) => (
        <li
          key={p.user_id}
          className="flex max-w-full items-center gap-1.5 rounded-md bg-fg/5 px-2.5 py-1 text-ds-xs text-normal"
        >
          <span className="min-w-0 truncate">{p.display_name || p.username}</span>
          {running && isPlayingGame(playing[p.user_id], game) && (
            <span className="shrink-0 rounded bg-success/10 px-1.5 text-success">Jogando</span>
          )}
        </li>
      ))}
    </ul>
  )
}
