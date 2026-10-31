import { useRef } from 'react'
import {
  NAMEPLATE_MODES,
  resolveNameplateMode,
  type NameplateMode
} from '../../../../profile/lib/cosmetics'
import { radioKey } from '../../../lib/cosmeticsEditor'

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
    if (radioKey(e.key, index, NAMEPLATE_MODES.length, (i) => refs.current[i]?.focus()))
      e.preventDefault()
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
            // aria-disabled (e não disabled): o foco fica onde está enquanto salva.
            aria-disabled={busy}
            onClick={() => !busy && onChoose(m)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`min-h-11 cursor-pointer rounded-lg border px-3 text-left text-ds-sm font-medium transition-colors focus-ring aria-disabled:cursor-wait aria-disabled:opacity-60 ${
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
