import type { ServerEvent } from '../api/events'
import EventForm from './EventForm'

/** Abre o formulário quando o painel pediu: evento novo ('new') ou a edição de um existente. */
export default function EventFormHost({
  serverId,
  editing,
  onClose,
  onSaved
}: {
  serverId: string
  editing: ServerEvent | 'new' | null
  onClose: () => void
  onSaved: (event: ServerEvent) => void
}): React.JSX.Element | null {
  if (!editing) return null
  return (
    <EventForm
      serverId={serverId}
      event={editing === 'new' ? undefined : editing}
      onClose={onClose}
      onSaved={onSaved}
    />
  )
}
