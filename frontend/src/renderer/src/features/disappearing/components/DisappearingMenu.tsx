import { useEffect, useRef, type KeyboardEvent } from 'react'
import { trapTab } from '../../../shared/lib/focusTrap'
import { CheckIcon } from '../../../shared/ui/icons'
import { DISAPPEARING_OPTIONS, type DisappearingSeconds } from '../lib/disappearing'
import { checkedOptionIndex, keyTarget, optionTabIndex } from '../lib/menuFocus'

const POPOVER_CLASS =
  'absolute right-0 top-full z-50 mt-1 w-48 rounded-lg border border-subtle bg-floating p-1.5 shadow-2xl'
const SHEET_CLASS =
  'animate-sheet-in fixed inset-x-0 bottom-0 z-50 overscroll-contain rounded-t-xl border-t border-subtle bg-floating px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-2xl'

function radiosIn(root: HTMLElement | null): HTMLElement[] {
  return Array.from(root?.querySelectorAll<HTMLElement>('[role="radio"]') ?? [])
}

/** Setas, Home e End levam o foco à opção seguinte. */
function moveFocus(e: KeyboardEvent, root: HTMLElement | null): void {
  const target = keyTarget(radiosIn(root), document.activeElement, e.key)
  if (!target) return
  e.preventDefault()
  target.focus()
}

/**
 * As quatro opções do prazo (radio, a atual marcada): popover, ou folha de baixo
 * em tela estreita. O foco entra na opção marcada; setas, Home e End andam entre
 * as opções (roving tabindex); na folha o Tab fica preso.
 */
function DisappearingMenu({
  id,
  current,
  sheet,
  onChoose
}: {
  id?: string
  current: DisappearingSeconds | null
  sheet: boolean
  onChoose: (seconds: DisappearingSeconds | null) => void
}): React.JSX.Element {
  const groupRef = useRef<HTMLDivElement>(null)
  const checkedIndex = checkedOptionIndex(current)

  useEffect(() => {
    radiosIn(groupRef.current)[checkedIndex]?.focus()
  }, [checkedIndex])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (sheet) trapTab(e, groupRef.current)
    moveFocus(e, groupRef.current)
  }

  return (
    <div
      ref={groupRef}
      id={id}
      role="dialog"
      aria-label="Mensagens temporárias"
      aria-modal={sheet ? true : undefined}
      onKeyDown={onKeyDown}
      className={sheet ? SHEET_CLASS : POPOVER_CLASS}
    >
      <div role="radiogroup" aria-label="Mensagens temporárias">
        {DISAPPEARING_OPTIONS.map((o, i) => {
          const checked = o.seconds === current
          return (
            <button
              key={o.label}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={optionTabIndex(i, checkedIndex)}
              onClick={() => onChoose(o.seconds)}
              className={`focus-ring flex min-h-10 w-full cursor-pointer items-center justify-between rounded px-3 py-1.5 text-left text-ds-sm font-medium transition-colors hover:bg-fg/10 max-sm:min-h-12 max-sm:text-ds-md ${checked ? 'text-strong' : 'text-secondary'}`}
            >
              {o.label}
              <span
                aria-hidden="true"
                className={`flex size-4 shrink-0 items-center justify-center rounded-full border-2 ${checked ? 'border-brand bg-brand text-white' : 'border-subtle'}`}
              >
                {checked && <CheckIcon size={12} />}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default DisappearingMenu
