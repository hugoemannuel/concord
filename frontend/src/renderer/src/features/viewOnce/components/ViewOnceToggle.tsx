import IconButton from '../../../shared/ui/IconButton'
import { EyeIcon } from '../../../shared/ui/icons'

/** Liga/desliga a visualização única do anexo; ligado, fica em destaque. */
function ViewOnceToggle({
  on,
  onToggle
}: {
  on: boolean
  onToggle: () => void
}): React.JSX.Element {
  return (
    <IconButton
      icon={EyeIcon}
      label="Visualização única"
      size="md"
      variant="media"
      aria-pressed={on}
      className={on ? 'text-brand! ring-2 ring-brand' : ''}
      onClick={onToggle}
    />
  )
}

/** Selo no cartão do anexo quando a visualização única está ligada. */
export function ViewOnceBadge(): React.JSX.Element {
  return (
    <span className="flex items-center gap-1 text-ds-xs text-brand">
      <EyeIcon size={12} aria-hidden />
      Visualização única
    </span>
  )
}

export default ViewOnceToggle
