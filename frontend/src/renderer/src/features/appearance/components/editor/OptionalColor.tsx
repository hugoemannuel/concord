import Button from '../../../../shared/ui/Button'
import { ColorSwatch } from '../../../settings/components/profile/controls'
import type { GroupProps } from './types'

type OptionalField = 'highlight' | 'textMuted' | 'border'

/** Cor que pode ficar no automático (sai das outras): a amostra mostra a cor em uso. */
export function OptionalColor({
  label,
  field,
  auto,
  draft,
  update
}: GroupProps & { label: string; field: OptionalField; auto: string }): React.JSX.Element {
  const value = draft[field]
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <ColorSwatch label={label} value={value || auto} onChange={(c) => update({ [field]: c }, field)} />
      {value ? (
        <Button variant="ghost" size="sm" onClick={() => update({ [field]: '' }, field)}>
          Voltar ao automático
        </Button>
      ) : (
        <span className="text-ds-xs text-muted">Automático</span>
      )}
    </div>
  )
}
