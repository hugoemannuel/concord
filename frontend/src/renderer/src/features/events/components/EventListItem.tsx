import { CheckIcon } from '../../../shared/ui/icons'
import type { ServerEvent } from '../api/events'
import { formatWhen } from '../lib/eventTime'
import { goingText } from '../lib/eventText'
import { recurrenceLabel } from '../lib/recurrence'
import EventGame from './EventGame'

/** Uma linha da lista de eventos: abre o detalhe ao clicar. */
export default function EventListItem({
  event,
  selected,
  onSelect
}: {
  event: ServerEvent
  selected: boolean
  onSelect: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? 'true' : undefined}
      className={`focus-ring flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
        selected ? 'border-brand bg-brand/10' : 'border-subtle bg-fg/5 hover:bg-fg/10'
      }`}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-ds-md font-semibold text-strong">{event.title}</span>
        <span className="block text-ds-xs text-secondary">{formatWhen(event.next_start_at)}</span>
        <EventGame name={event.game_name} className="text-ds-xs text-secondary" />
        <span className="block text-ds-xs text-muted">
          {`${recurrenceLabel(event.recurrence, new Date(event.starts_at))} · ${goingText(event.going_count)}`}
        </span>
      </span>
      {event.my_rsvp === true && (
        <span className="shrink-0 text-success">
          <CheckIcon size={20} />
          <span className="sr-only">Você vai</span>
        </span>
      )}
    </button>
  )
}
