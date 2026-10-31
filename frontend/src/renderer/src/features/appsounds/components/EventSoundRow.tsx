import { useRef } from 'react'
import Button from '../../../shared/ui/Button'
import IconButton from '../../../shared/ui/IconButton'
import { PlayIcon, TrashIcon } from '../../../shared/ui/icons'
import { eventOptions } from '../lib/eventOptions'
import type { SoundEvent } from '../lib/events'
import { APP_SOUND_ACCEPT } from '../lib/soundFile'

export interface EventSoundRowProps {
  event: SoundEvent
  label: string
  /** Pacote escolhido (nome na opção "Do pacote"). */
  packId: string
  /** Valor do seletor ('pack', id de pacote, 'custom' ou 'off'). */
  choice: string
  hasCustom: boolean
  busy: 'upload' | 'remove' | null
  error: string | null
  onChoice: (choice: string) => void
  onPreview: () => void
  onUpload: (file: File) => void
  onRemove: () => void
}

/** Um evento: qual som toca, ouvir, enviar o próprio áudio e removê-lo. */
function EventSoundRow(props: EventSoundRowProps): React.JSX.Element {
  const { event, label, choice, hasCustom, busy, error } = props
  const input = useRef<HTMLInputElement>(null)
  const errorId = `sound-error-${event}`

  return (
    <li className="flex flex-col gap-2 py-3 lg:flex-row lg:flex-wrap lg:items-center lg:gap-3">
      <span className="min-w-0 flex-1 text-ds-sm text-normal">{label}</span>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={choice}
          onChange={(e) => props.onChoice(e.target.value)}
          aria-label={`Som: ${label}`}
          aria-describedby={error ? errorId : undefined}
          className="glass-input !py-2 w-full min-w-0 text-ds-sm sm:w-auto sm:min-w-40 sm:flex-1 lg:w-56 lg:flex-none"
        >
          {eventOptions(props.packId, hasCustom).map((o) => (
            <option key={o.value} value={o.value} className="bg-floating">
              {o.label}
            </option>
          ))}
        </select>
        <IconButton icon={PlayIcon} label={`Ouvir: ${label}`} disabled={choice === 'off'} onClick={props.onPreview} />
        <Button variant="secondary" loading={busy === 'upload'} onClick={() => input.current?.click()}>
          {hasCustom ? 'Trocar áudio' : 'Enviar áudio'}
        </Button>
        {hasCustom && (
          <IconButton
            icon={TrashIcon}
            label={`Remover meu áudio: ${label}`}
            variant="danger"
            disabled={busy !== null}
            onClick={props.onRemove}
          />
        )}
        <input
          ref={input}
          type="file"
          accept={APP_SOUND_ACCEPT}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) props.onUpload(file)
          }}
        />
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-ds-xs text-danger lg:basis-full">
          {error}
        </p>
      )}
    </li>
  )
}

export default EventSoundRow
