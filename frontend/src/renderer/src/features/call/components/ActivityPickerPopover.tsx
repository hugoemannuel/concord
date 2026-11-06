import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ACTIVITIES,
  validateActivityLink,
  type ActivityDefinition
} from '../../../../../shared/activities'
import { useActivityStore } from '../../activity/store/activityStore'
import { useCallStore } from '../store/callStore'
import { IS_WEB } from '../../../shared/lib/config'
import { CrosshairIcon } from '../../../shared/ui/icons'
import Button from '../../../shared/ui/Button'
import { useDismiss } from '../../../shared/hooks/useDismiss'
import { insideAny } from '../../../shared/lib/dismiss'

const POPOVER_WIDTH = 360
const GAP = 10
const MARGIN = 8

/** Ícone de cada atividade do catálogo. */
export function ActivityGlyph({
  className = ''
}: {
  activity: ActivityDefinition
  className?: string
}): React.JSX.Element {
  return <CrosshairIcon className={className} />
}

function ActivityCard({
  activity,
  selected,
  onSelect
}: {
  activity: ActivityDefinition
  selected: boolean
  onSelect: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex w-full cursor-pointer items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
        selected
          ? 'border-brand bg-brand/15'
          : 'border-subtle bg-fg/[0.04] hover:border-normal hover:bg-fg/[0.08]'
      }`}
    >
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-input"
        style={{ color: activity.accent }}
      >
        <ActivityGlyph activity={activity} className="h-6 w-6" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-ds-sm font-bold text-strong">{activity.name}</span>
          <span className="rounded bg-fg/10 px-1.5 py-0.5 text-ds-xxs font-bold uppercase tracking-wider text-secondary">
            {activity.category}
          </span>
        </span>
        <span className="mt-0.5 block text-ds-xs leading-snug text-muted">
          {activity.description}
        </span>
      </span>
    </button>
  )
}

/** Escolha da atividade (catálogo) e link opcional da sala, ao lado dos controles. */
function ActivityPickerPopover({
  anchor,
  onClose
}: {
  anchor: HTMLElement
  onClose: () => void
}): React.JSX.Element | null {
  const ref = useRef<HTMLDivElement>(null)
  const callId = useCallStore((s) => s.callId)
  const start = useActivityStore((s) => s.start)
  const [selectedId, setSelectedId] = useState(ACTIVITIES[0]?.id ?? '')
  const [link, setLink] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useDismiss((target) => insideAny([ref.current, anchor], target), () => onClose())

  const selected = ACTIVITIES.find((a) => a.id === selectedId)

  const handleStart = async (): Promise<void> => {
    if (!selected || !callId || busy) return
    const checked = validateActivityLink(selected.id, link)
    if (!checked.ok) {
      setError(checked.error)
      return
    }
    setBusy(true)
    const failure = await start(callId, selected.id, checked.url)
    setBusy(false)
    if (failure) {
      setError(failure)
      return
    }
    onClose()
  }

  const rect = anchor.getBoundingClientRect()
  // No celular (360 px) encolhe para caber com margem dos dois lados.
  const width = Math.min(POPOVER_WIDTH, window.innerWidth - MARGIN * 2)
  const left = Math.min(
    Math.max(MARGIN, rect.left + rect.width / 2 - width / 2),
    window.innerWidth - width - MARGIN
  )
  const bottom = Math.max(MARGIN, window.innerHeight - rect.top + GAP)

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label="Atividades"
      style={{ width, left, bottom }}
      className="fixed z-50 flex max-h-[460px] flex-col rounded-xl border border-subtle bg-floating p-4 shadow-2xl"
    >
      <div className="mb-3">
        <p className="text-ds-sm font-bold text-strong">Atividades</p>
        <p className="text-ds-xs text-muted">
          Jogue com quem está na chamada — a voz continua aqui.
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {ACTIVITIES.map((activity) => (
          <ActivityCard
            key={activity.id}
            activity={activity}
            selected={activity.id === selectedId}
            onSelect={() => {
              setSelectedId(activity.id)
              setError(null)
            }}
          />
        ))}
      </div>

      {selected && (
        <form
          className="mt-3 space-y-2"
          onSubmit={(e) => {
            e.preventDefault()
            void handleStart()
          }}
        >
          <label className="block">
            <span className="mb-1 block text-ds-xs font-semibold text-secondary">
              Cole o link da sala (opcional)
            </span>
            <input
              type="text"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              value={link}
              onChange={(e) => {
                setLink(e.target.value)
                setError(null)
              }}
              placeholder={selected.linkExample}
              aria-invalid={error !== null}
              className={`w-full rounded-xl border bg-input px-3 py-1.5 text-ds-xs text-strong placeholder:text-faint focus:outline-none ${
                error ? 'border-danger' : 'border-subtle focus:border-brand'
              }`}
            />
          </label>
          {error ? (
            <p role="alert" className="text-ds-xs text-danger">
              {error}
            </p>
          ) : (
            <p className="text-ds-xs text-faint">
              {/* No desktop a janela do jogo é observada e a sala vai sozinha; no
                  navegador o iframe de outro site não deixa ler a URL. */}
              {IS_WEB
                ? 'Sem link, quem entrar abre a página inicial do jogo. Pode colar só o código da sala.'
                : `${selected.roomHint} Sem link, quem entrar abre a página inicial.`}
            </p>
          )}
          <Button type="submit" size="sm" disabled={!callId || busy} className="w-full">
            {busy ? 'Abrindo…' : `Abrir ${selected.name}`}
          </Button>
        </form>
      )}
    </div>,
    document.body
  )
}

export default ActivityPickerPopover
