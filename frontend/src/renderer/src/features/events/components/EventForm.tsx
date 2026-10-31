import { useEffect, useRef, useState } from 'react'
import Button from '../../../shared/ui/Button'
import Input from '../../../shared/ui/Input'
import Modal from '../../../shared/ui/Modal'
import type { ServerEvent } from '../api/events'
import {
  MAX_DESCRIPTION,
  MAX_TITLE,
  emptyForm,
  formFromEvent,
  type EventFormValues
} from '../lib/eventForm'
import { saveEvent } from '../lib/eventSave'
import { isRunning } from '../lib/running'
import { useEventsStore } from '../store/eventsStore'
import BannerField from './BannerField'
import DurationField from './DurationField'
import GameField from './GameField'
import RecurrenceFields from './RecurrenceFields'
import ReminderPicker from './ReminderPicker'

const LABEL = 'flex flex-col gap-1.5 text-ds-sm font-medium text-secondary'

/** Criar ou editar um evento. Salvar manda o pedido e avisa quem abriu com o evento salvo. */
export default function EventForm({
  serverId,
  event,
  onClose,
  onSaved
}: {
  serverId: string
  event?: ServerEvent
  onClose: () => void
  onSaved: (event: ServerEvent) => void
}): React.JSX.Element {
  const create = useEventsStore((s) => s.create)
  const update = useEventsStore((s) => s.update)
  const [values, setValues] = useState<EventFormValues>(() =>
    event ? formFromEvent(event) : emptyForm()
  )
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // Com o evento em andamento só título, descrição e banner mudam (o servidor confere de novo).
  const running = event ? isRunning(event) : false
  const patch = (change: Partial<EventFormValues>): void => setValues((v) => ({ ...v, ...change }))
  // O botão fica no fim do formulário: leva o foco (e a tela) até o erro.
  const alertRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (error) alertRef.current?.focus()
  }, [error])

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setError(null)
    setSaving(true)
    const result = await saveEvent(serverId, event, values, { create, update })
    if (result.ok) return onSaved(result.event)
    setError(result.error)
    setSaving(false)
  }

  return (
    <Modal open wide title={event ? 'Editar evento' : 'Novo evento'} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        {error && (
          <div
            ref={alertRef}
            tabIndex={-1}
            role="alert"
            className="rounded-lg border border-danger/20 bg-danger/10 p-2.5 text-ds-xs text-danger"
          >
            {error}
          </div>
        )}
        {running && (
          <p role="status" className="rounded-lg border border-warning/20 bg-warning/10 p-2.5 text-ds-xs text-warning">
            O evento está em andamento: só dá para mudar título, descrição e banner.
          </p>
        )}
        <BannerField
          serverId={serverId}
          bannerId={values.bannerId}
          onChange={(bannerId) => patch({ bannerId })}
          onError={setError}
        />
        <Input
          label="Título"
          name="event-title"
          value={values.title}
          maxLength={MAX_TITLE}
          autoComplete="off"
          onChange={(e) => patch({ title: e.target.value })}
        />
        <label className={LABEL}>
          Descrição (opcional)
          <textarea
            name="event-description"
            autoComplete="off"
            className="glass-input resize-none text-ds-sm"
            rows={4}
            maxLength={MAX_DESCRIPTION}
            value={values.description}
            onChange={(e) => patch({ description: e.target.value })}
          />
        </label>
        <label className={LABEL}>
          Quando começa
          <input
            type="datetime-local"
            name="event-starts-at"
            disabled={running}
            autoComplete="off"
            className="glass-input"
            value={values.startsAt}
            onChange={(e) => patch({ startsAt: e.target.value })}
          />
        </label>
        <DurationField
          value={values.durationMinutes}
          onChange={(durationMinutes) => patch({ durationMinutes })}
          disabled={running}
        />
        <GameField
          choice={values.gameChoice}
          custom={values.customGame}
          disabled={running}
          onChange={patch}
        />
        <RecurrenceFields values={values} onChange={patch} disabled={running} />
        <ReminderPicker selected={values.reminders} onChange={(reminders) => patch({ reminders })} disabled={running} />
        <div className="sticky bottom-0 -mx-1 flex justify-end gap-2 bg-modal px-1 pb-1 pt-3">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={saving} disabled={saving}>
            Salvar evento
          </Button>
        </div>
      </form>
    </Modal>
  )
}
