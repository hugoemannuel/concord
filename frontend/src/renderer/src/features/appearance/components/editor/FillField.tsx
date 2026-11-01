import Button from '../../../../shared/ui/Button'
import IconButton from '../../../../shared/ui/IconButton'
import { MinusIcon, PlusIcon } from '../../../../shared/ui/icons'
import { GRADIENT_DIRECTIONS } from '../../../profile/lib/profileThemeExtras'
import { ChipGroup, ColorSwatch } from '../../../settings/components/profile/controls'
import { gradientArrow } from '../../../settings/components/profile/theme/effectIcons'
import { addStop, removeStop, withAngle, withMode, withStop, type FillMode } from '../../lib/fillEditor'
import { MAX_GRADIENT_COLORS, type FillField as Field } from '../../lib/themeInput'
import type { GroupProps } from './types'

// Mesma UX do fundo do cartão de perfil (Configurações → Perfis): chips do
// tipo, amostras de cor e as setas de direção.

const MODE_CHIPS = [
  { id: 'solid', label: 'Sólido' },
  { id: 'linear', label: 'Degradê' },
  { id: 'radial', label: 'Radial' }
]

const DIRECTION_CHIPS = GRADIENT_DIRECTIONS.map((d) => ({
  id: String(d.angle),
  label: d.label,
  icon: gradientArrow(d.angle),
  iconOnly: true
}))

/** Uma cor que pode virar degradê (2–3 paradas, linear ou radial). */
export function FillField({ label, field, draft, update }: GroupProps & { label: string; field: Field }): React.JSX.Element {
  const gradient = draft.gradients[field]
  const key = `${field}-gradient`
  const set = (gradients: typeof draft.gradients, k = key): void => update({ gradients }, k)
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-subtle p-2">
      <ColorSwatch label={label} value={draft[field]} onChange={(c) => update({ [field]: c }, field)} />
      <ChipGroup
        label={`${label}: tipo de preenchimento`}
        options={MODE_CHIPS}
        value={gradient?.type ?? 'solid'}
        onPick={(mode) => set(withMode(draft, field, mode as FillMode))}
        className="grid-cols-3"
      />
      {gradient && (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            {gradient.colors.map((color, i) => (
              <ColorSwatch
                key={i}
                label={`Cor ${i + 2}`}
                value={color}
                onChange={(c) => set(withStop(draft, field, i, c), `${key}-${i}`)}
              />
            ))}
            {gradient.colors.length < MAX_GRADIENT_COLORS && (
              <Button variant="ghost" size="sm" icon={PlusIcon} onClick={() => set(addStop(draft, field))}>
                Cor
              </Button>
            )}
            {gradient.colors.length > 1 && (
              <IconButton icon={MinusIcon} label="Tirar a última cor" onClick={() => set(removeStop(draft, field))} />
            )}
          </div>
          {gradient.type === 'linear' && (
            <ChipGroup
              label={`${label}: direção do degradê`}
              options={DIRECTION_CHIPS}
              value={String(gradient.angle)}
              onPick={(angle) => set(withAngle(draft, field, Number(angle)))}
              className="grid-cols-4"
            />
          )}
        </>
      )}
    </div>
  )
}
