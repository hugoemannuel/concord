import { ChipGroup, RangeField, SubLabel } from '../../../settings/components/profile/controls'
import { RADIUS_MAX, type Density, type FontId } from '../../lib/themeInput'
import { EditorGroup } from './EditorGroup'
import type { GroupProps } from './types'

const DENSITY_CHIPS: Array<{ id: Density; label: string }> = [
  { id: 'compact', label: 'Compacta' },
  { id: 'normal', label: 'Normal' },
  { id: 'comfortable', label: 'Confortável' }
]

const FONT_CHIPS: Array<{ id: FontId; label: string }> = [
  { id: 'outfit', label: 'Padrão' },
  { id: 'system', label: 'Do sistema' },
  { id: 'serif', label: 'Serifada' },
  { id: 'mono', label: 'Monoespaçada' }
]

function radiusLabel(radius: number): string {
  if (radius === 0) return 'Retos'
  if (radius === 100) return 'Padrão'
  return `${radius}%`
}

/** Cantos, densidade e fonte da interface. */
export function ShapeGroup({ draft, update }: GroupProps): React.JSX.Element {
  return (
    <EditorGroup title="Forma e fonte">
      <RangeField
        label="Cantos"
        value={draft.radius}
        min={0}
        max={RADIUS_MAX}
        step={10}
        display={radiusLabel(draft.radius)}
        onChange={(radius) => update({ radius }, 'radius')}
      />
      <div className="flex flex-col gap-1">
        <SubLabel>Densidade</SubLabel>
        <ChipGroup
          label="Densidade"
          options={DENSITY_CHIPS}
          value={draft.density}
          onPick={(density) => update({ density: density as Density }, 'density')}
          className="grid-cols-3"
        />
      </div>
      <div className="flex flex-col gap-1">
        <SubLabel>Fonte</SubLabel>
        <ChipGroup
          label="Fonte da interface"
          options={FONT_CHIPS}
          value={draft.font}
          onPick={(font) => update({ font: font as FontId }, 'font')}
          className="grid-cols-2"
        />
      </div>
    </EditorGroup>
  )
}
