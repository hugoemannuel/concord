import { useRef } from 'react'
import {
  NAMEPLATE_MODES,
  resolveNameplateMode,
  type NameplateMode
} from '../../../../profile/lib/cosmetics'
import { radioStep } from '../../../lib/cosmeticsEditor'

const LABEL: Record<NameplateMode, string> = {
  off: 'Desligada',
  banner: 'Usar o banner',
  custom: 'Imagem própria'
}

/** As três opções da faixa, como grupo de rádio (Tab entra na marcada; setas trocam). */
export default function NameplateOptions({
  mode,
  busy,
  onChoose
}: {
  mode: NameplateMode | undefined
  busy: boolean
  onChoose: (mode: NameplateMode) => void
}): React.JSX.Element {
  const current = resolveNameplateMode(mode)
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const onKeyDown = (e: React.KeyboardEvent, index: number): void => {
    const next = radioStep(index, e.key, NAMEPLATE_MODES.length)
    if (next === null) return
    e.preventDefault()
    refs.current[next]?.focus()
    onChoose(NAMEPLATE_MODES[next])
  }
  return (
    <div role="radiogroup" aria-label="Faixa" className="grid gap-2 sm:grid-cols-3">
      {NAMEPLATE_MODES.map((m, i) => {
        const checked = m === current
        return (
          <button
            key={m}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            disabled={busy}
            onClick={() => onChoose(m)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`min-h-11 cursor-pointer rounded-lg border px-3 text-left text-ds-sm font-medium transition-colors focus-ring disabled:cursor-wait disabled:opacity-60 ${
              checked
                ? 'border-brand bg-fg/5 text-strong'
                : 'border-subtle text-normal hover:bg-fg/5'
            }`}
          >
            {LABEL[m]}
          </button>
        )
      })}
    </div>
  )
}
