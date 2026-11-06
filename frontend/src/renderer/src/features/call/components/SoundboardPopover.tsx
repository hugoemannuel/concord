import { useCallback, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useCallStore } from '../store/callStore'
import { useVoiceModStore } from '../store/voiceModStore'
import { isVoiceModActive } from '../lib/voiceModPresets'
import { MicIcon, SoundPadsIcon } from '../../../shared/ui/icons'
import SoundboardSoundsPanel from './SoundboardSoundsPanel'
import VoiceModPanel from './VoiceModPanel'
import { useDismiss } from '../../../shared/hooks/useDismiss'
import { insideAny } from '../../../shared/lib/dismiss'

const POPOVER_WIDTH = 480
const GAP = 10
const MARGIN = 8

type Section = 'sounds' | 'voice'

const SECTIONS: { id: Section; label: string; subtitle: string }[] = [
  { id: 'sounds', label: 'Sons', subtitle: 'Toque sons na chamada para todos' },
  { id: 'voice', label: 'Voz', subtitle: 'Todos na chamada ouvem a sua voz alterada' }
]

function SoundboardPopover({
  anchor,
  onClose
}: {
  anchor: HTMLElement
  onClose: () => void
}): React.JSX.Element | null {
  const ref = useRef<HTMLDivElement>(null)
  const serverId = useCallStore((s) => s.serverId)
  const voiceModActive = useVoiceModStore(isVoiceModActive)
  const [section, setSection] = useState<Section>('sounds')
  // Modal de upload ou gravação de atalho aberto na seção Sons: não fechar por fora.
  const [busy, setBusy] = useState(false)
  const handleBusy = useCallback((next: boolean) => setBusy(next), [])

  useDismiss((target) => insideAny([ref.current, anchor], target), () => onClose(), { enabled: !busy })

  if (!serverId) return null

  const rect = anchor.getBoundingClientRect()
  // No celular (360 px) encolhe para caber com margem dos dois lados.
  const width = Math.min(POPOVER_WIDTH, window.innerWidth - MARGIN * 2)
  const left = Math.min(
    Math.max(MARGIN, rect.left + rect.width / 2 - width / 2),
    window.innerWidth - width - MARGIN
  )
  const bottom = Math.max(MARGIN, window.innerHeight - rect.top + GAP)
  const current = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0]

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label="Mesa de áudio"
      style={{ width, left, bottom }}
      className="fixed z-50 flex max-h-[460px] gap-3 rounded-xl border border-subtle bg-floating p-3 shadow-2xl"
    >
      <div
        role="tablist"
        aria-orientation="vertical"
        className="flex shrink-0 flex-col gap-1.5 border-r border-subtle pr-3"
      >
        {SECTIONS.map(({ id, label }) => {
          const selected = id === section
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-label={label}
              title={label}
              onClick={() => setSection(id)}
              className={`relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl transition-colors ${
                selected
                  ? 'bg-brand text-white'
                  : 'bg-fg/[0.06] text-secondary hover:bg-fg/[0.12] hover:text-strong'
              }`}
            >
              {id === 'sounds' ? (
                <SoundPadsIcon className="h-5 w-5" />
              ) : (
                <MicIcon className="h-5 w-5" />
              )}
              {id === 'voice' && voiceModActive && (
                <span
                  aria-hidden="true"
                  className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--bg-floating)] bg-success-strong"
                />
              )}
            </button>
          )
        })}
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="mb-3">
          <p className="text-ds-sm font-bold text-strong">Mesa de áudio · {current.label}</p>
          <p className="text-ds-xs text-muted">{current.subtitle}</p>
        </div>
        {section === 'sounds' ? (
          <SoundboardSoundsPanel serverId={serverId} onBusyChange={handleBusy} />
        ) : (
          <VoiceModPanel />
        )}
      </div>
    </div>,
    document.body
  )
}

export default SoundboardPopover
