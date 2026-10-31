import { useState } from 'react'
import Modal from '../../../shared/ui/Modal'
import { useServerStore } from '../../servers/store/serverStore'
import type { ServerEvent } from '../api/events'
import { useEventAction } from '../hooks/useEventAction'
import { useEventAccess } from '../hooks/useEventAccess'
import { useEvents } from '../hooks/useEvents'
import { useEventsStore } from '../store/eventsStore'
import EventFormHost from './EventFormHost'
import EventsPanelBody from './EventsPanelBody'

/** O painel de eventos de um servidor: lista, detalhe, presença e, para quem o dono liberou, criar, editar e cancelar. */
export default function EventsPanel({
  serverId,
  onClose
}: {
  serverId: string
  onClose: () => void
}): React.JSX.Element {
  const { events, error, reload } = useEvents(serverId)
  const { busy, notice, run } = useEventAction()
  // O dono escolhe, por cargo, quem cria, edita e exclui; sem resposta, nenhum botão.
  const access = useEventAccess(serverId)
  const channels = useServerStore((s) => s.channels)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editing, setEditing] = useState<ServerEvent | 'new' | null>(null)

  const cancelEvent = async (id: string): Promise<void> => {
    await useEventsStore.getState().cancel(serverId, id)
    setSelectedId(null)
  }

  return (
    <Modal open xl title="Eventos" onClose={onClose}>
      {notice && (
        <div role="alert" className="mb-3 rounded-lg border border-danger/20 bg-danger/10 p-2.5 text-ds-xs text-danger">
          {notice}
        </div>
      )}
      <EventsPanelBody
        serverId={serverId}
        events={events}
        error={error}
        canCreate={Boolean(access?.create)}
        canEdit={Boolean(access?.edit)}
        canDelete={Boolean(access?.delete)}
        channels={channels}
        selectedId={selectedId}
        busy={busy}
        onSelect={setSelectedId}
        onCreate={() => setEditing('new')}
        onEdit={setEditing}
        onRetry={reload}
        onRespond={(id, going) => void run(() => useEventsStore.getState().respond(serverId, id, going))}
        onCancelEvent={(id) => void run(() => cancelEvent(id))}
      />
      <EventFormHost
        serverId={serverId}
        editing={editing}
        onClose={() => setEditing(null)}
        onSaved={(saved) => {
          setEditing(null)
          setSelectedId(saved.id)
        }}
      />
    </Modal>
  )
}
