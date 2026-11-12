import type { Ref } from 'react'
import type { ViewOnceMedia } from '../../chat/api/messages'
import { EyeIcon } from '../../../shared/ui/icons'
import { pillLabel, type PillState } from '../lib/viewOnce'

/** A pílula no lugar da mídia: botão só quando ainda dá para abrir; nos outros estados, texto. */
function ViewOncePill({
  state,
  media,
  onOpen,
  ref
}: {
  state: PillState
  media: ViewOnceMedia
  onOpen: () => void
  /** Para devolver o foco à pílula quando o visualizador fecha. */
  ref?: Ref<HTMLElement>
}): React.JSX.Element {
  const label = pillLabel(state, media.kind, media)
  const box =
    'inline-flex min-h-10 max-w-full items-center gap-2 rounded-full bg-fg/5 px-4 text-ds-sm'
  if (state !== 'unseen') {
    return (
      <span ref={ref} tabIndex={-1} role="status" className={`${box} text-muted focus-ring`}>
        <EyeIcon size={16} aria-hidden />
        <span className="min-w-0 break-words">{label}</span>
      </span>
    )
  }
  return (
    <button
      ref={ref as Ref<HTMLButtonElement>}
      type="button"
      onClick={onOpen}
      className={`${box} focus-ring cursor-pointer break-words text-left font-medium text-strong hover:bg-fg/10`}
    >
      <EyeIcon size={16} aria-hidden />
      {label}
    </button>
  )
}

export default ViewOncePill
