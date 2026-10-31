import { useState } from 'react'
import Button from '../../../shared/ui/Button'
import { CalendarIcon, ClockIcon, PencilIcon, TrashIcon, VolumeIcon } from '../../../shared/ui/icons'
import type { ServerEvent } from '../api/events'
import { durationLabel } from '../lib/duration'
import { endTimeLabel, formatWhen } from '../lib/eventTime'
import { goingText } from '../lib/eventText'
import { recurrenceLabel } from '../lib/recurrence'
import EventBanner from './EventBanner'
import GoingList from './GoingList'
import RsvpButtons from './RsvpButtons'

function Fact({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }): React.JSX.Element {
  return (
    <p className="flex items-start gap-2 text-ds-sm text-normal">
      <span className="mt-0.5 shrink-0 text-muted">{icon}</span>
      <span className="min-w-0 break-words">{children}</span>
    </p>
  )
}

/** A sala própria do evento: aberta (com o nome do canal) ou ainda por abrir. */
function roomText(event: ServerEvent, roomName: string | null): string {
  if (!event.voice_channel_id) {
    return 'A sala abre na hora de começar; só entra quem confirmou presença.'
  }
  return roomName ? `Sala aberta: #${roomName}` : 'Sala aberta'
}

/** Cancelar o evento pede uma confirmação, no próprio lugar do botão. */
function CancelEventButton({ onConfirm }: { onConfirm: () => void }): React.JSX.Element {
  const [asking, setAsking] = useState(false)
  if (!asking) {
    return (
      <Button variant="ghost" icon={TrashIcon} onClick={() => setAsking(true)}>
        Cancelar evento
      </Button>
    )
  }
  return (
    <div role="alertdialog" aria-label="Confirmar cancelamento" className="flex flex-wrap items-center gap-2">
      <span className="text-ds-sm text-normal">Cancelar este evento para todos?</span>
      <Button variant="danger" onClick={onConfirm}>
        Cancelar o evento
      </Button>
      <Button variant="ghost" onClick={() => setAsking(false)}>
        Voltar
      </Button>
    </div>
  )
}

/** O evento aberto: banner, quando e onde, descrição, minha resposta e quem vai. */
export default function EventDetail({
  serverId,
  event,
  roomName,
  canEdit,
  canDelete,
  busy,
  onRespond,
  onEdit,
  onCancelEvent,
  onBack
}: {
  serverId: string
  event: ServerEvent
  /** O nome do canal de voz da sala aberta (null se o canal não está na lista). */
  roomName: string | null
  canEdit: boolean
  canDelete: boolean
  busy: boolean
  onRespond: (going: boolean | null) => void
  onEdit: () => void
  onCancelEvent: () => void
  onBack: () => void
}): React.JSX.Element {
  return (
    <article className="flex min-w-0 flex-col gap-4">
      <Button variant="ghost" className="self-start xl:hidden" onClick={onBack}>
        Voltar à lista
      </Button>
      <EventBanner bannerId={event.banner_id} className="rounded-lg" />
      <div className="flex flex-col gap-1">
        <h3 className="break-words text-ds-xl font-semibold text-strong">{event.title}</h3>
        <p className="text-ds-sm text-secondary">{goingText(event.going_count)}</p>
      </div>
      <div className="flex flex-col gap-2">
        <Fact icon={<CalendarIcon size={16} />}>
          {`${formatWhen(event.next_start_at)} · ${recurrenceLabel(event.recurrence, new Date(event.starts_at))}`}
        </Fact>
        <Fact icon={<ClockIcon size={16} />}>
          {`Dura ${durationLabel(event.duration_minutes)}, até ${endTimeLabel(event.next_start_at, event.duration_minutes)}`}
        </Fact>
        <Fact icon={<VolumeIcon size={16} />}>{roomText(event, roomName)}</Fact>
      </div>
      {event.description && (
        <p className="whitespace-pre-wrap break-words text-ds-sm text-normal">{event.description}</p>
      )}
      <RsvpButtons value={event.my_rsvp} onChange={onRespond} disabled={busy} />
      <GoingList
        serverId={serverId}
        eventId={event.id}
        occurrence={event.next_start_at}
        count={event.going_count}
      />
      {(canEdit || canDelete) && (
        <div className="flex flex-wrap items-center gap-2 border-t border-subtle pt-4">
          {canEdit && (
            <Button variant="ghost" icon={PencilIcon} onClick={onEdit}>
              Editar
            </Button>
          )}
          {canDelete && <CancelEventButton onConfirm={onCancelEvent} />}
        </div>
      )}
    </article>
  )
}
