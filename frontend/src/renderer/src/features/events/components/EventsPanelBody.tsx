import Button from '../../../shared/ui/Button'
import { PlusIcon } from '../../../shared/ui/icons'
import type { ServerEvent } from '../api/events'
import EventDetail from './EventDetail'
import EventListItem from './EventListItem'

interface ChannelName {
  id: string
  name: string
}

interface BodyProps {
  serverId: string
  /** undefined = ainda carregando. */
  events: ServerEvent[] | undefined
  error: string | null
  canCreate: boolean
  canEdit: boolean
  canDelete: boolean
  channels: ChannelName[]
  selectedId: string | null
  /** Resposta em andamento: trava os botões Vou / Não vou. */
  busy?: boolean
  onSelect: (id: string | null) => void
  onCreate: () => void
  onEdit: (event: ServerEvent) => void
  onRetry: () => void
  onRespond: (eventId: string, going: boolean | null) => void
  onCancelEvent: (eventId: string) => void
}

function ListState({ events, error, onRetry }: Pick<BodyProps, 'events' | 'error' | 'onRetry'>): React.JSX.Element | null {
  if (events === undefined && error) {
    return (
      <div role="alert" className="flex flex-col items-start gap-2 rounded-lg border border-danger/20 bg-danger/10 p-3">
        <p className="text-ds-sm text-danger">{error}</p>
        <Button variant="ghost" onClick={onRetry}>
          Tentar de novo
        </Button>
      </div>
    )
  }
  if (events === undefined) {
    return (
      <p role="status" className="text-ds-sm text-muted">
        Carregando eventos…
      </p>
    )
  }
  if (events.length === 0) {
    return <p className="text-ds-sm text-muted">Nenhum evento marcado</p>
  }
  return null
}

/**
 * Lista e detalhe dos eventos. No celular e no tablet é uma coluna (a lista ou
 * o detalhe do evento aberto); de 1280 px em diante, lado a lado.
 */
export default function EventsPanelBody(props: BodyProps): React.JSX.Element {
  const { events, selectedId, channels, canCreate, canEdit, canDelete, busy = false } = props
  const selected = events?.find((e) => e.id === selectedId) ?? null
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 xl:flex-row">
      <section
        aria-label="Lista de eventos"
        className={`${selected ? 'hidden xl:flex' : 'flex'} min-w-0 flex-col gap-3 xl:w-80 xl:shrink-0`}
      >
        {canCreate && (
          <Button icon={PlusIcon} onClick={props.onCreate}>
            Criar evento
          </Button>
        )}
        <ListState events={events} error={props.error} onRetry={props.onRetry} />
        {events?.map((e) => (
          <EventListItem key={e.id} event={e} selected={e.id === selected?.id} onSelect={() => props.onSelect(e.id)} />
        ))}
      </section>
      <section
        aria-label="Detalhe do evento"
        className={`${selected ? 'flex' : 'hidden xl:flex'} min-w-0 flex-1 flex-col`}
      >
        {selected ? (
          <EventDetail
            serverId={props.serverId}
            event={selected}
            roomName={channels.find((c) => c.id === selected.voice_channel_id)?.name ?? null}
            canEdit={canEdit}
            canDelete={canDelete}
            busy={busy}
            onRespond={(going) => props.onRespond(selected.id, going)}
            onEdit={() => props.onEdit(selected)}
            onCancelEvent={() => props.onCancelEvent(selected.id)}
            onBack={() => props.onSelect(null)}
          />
        ) : (
          <p className="text-ds-sm text-muted">Selecione um evento para ver os detalhes.</p>
        )}
      </section>
    </div>
  )
}
