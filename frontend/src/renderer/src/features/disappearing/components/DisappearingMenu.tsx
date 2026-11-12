import { DISAPPEARING_OPTIONS, type DisappearingSeconds } from '../lib/disappearing'

const POPOVER_CLASS =
  'absolute right-0 top-full z-50 mt-1 w-48 rounded-lg border border-subtle bg-floating p-1.5 shadow-2xl'
const SHEET_CLASS =
  'animate-sheet-in fixed inset-x-0 bottom-0 z-50 rounded-t-xl border-t border-subtle bg-floating px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-2xl'

/** As quatro opções do prazo (radio, a atual marcada): popover, ou folha de baixo em tela estreita. */
function DisappearingMenu({
  current,
  sheet,
  onChoose
}: {
  current: DisappearingSeconds | null
  sheet: boolean
  onChoose: (seconds: DisappearingSeconds | null) => void
}): React.JSX.Element {
  return (
    <div
      role="radiogroup"
      aria-label="Mensagens temporárias"
      className={sheet ? SHEET_CLASS : POPOVER_CLASS}
    >
      {DISAPPEARING_OPTIONS.map((o) => {
        const checked = o.seconds === current
        return (
          <button
            key={o.label}
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => onChoose(o.seconds)}
            className={`focus-ring flex min-h-10 w-full cursor-pointer items-center justify-between rounded px-3 py-1.5 text-left text-ds-sm font-medium transition-colors hover:bg-fg/10 max-sm:min-h-12 max-sm:text-ds-md ${checked ? 'text-strong' : 'text-secondary'}`}
          >
            {o.label}
            <span
              aria-hidden="true"
              className={`size-3.5 shrink-0 rounded-full border-2 ${checked ? 'border-brand bg-brand' : 'border-subtle'}`}
            />
          </button>
        )
      })}
    </div>
  )
}

export default DisappearingMenu
