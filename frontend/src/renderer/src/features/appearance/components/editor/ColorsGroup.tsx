import { ColorSwatch, SubLabel } from '../../../settings/components/profile/controls'
import { flatten } from '../../lib/colorMath'
import type { Palette } from '../../lib/palette'
import { EditorGroup } from './EditorGroup'
import { FillField } from './FillField'
import { OptionalColor } from './OptionalColor'
import type { GroupProps } from './types'

const FILLS = [
  { field: 'accent', label: 'Destaque' },
  { field: 'background', label: 'Fundo principal' },
  { field: 'sidebar', label: 'Barra lateral' },
  { field: 'card', label: 'Cartões e menus' }
] as const

/** Cores: os quatro preenchimentos (sólido ou degradê), o texto e as cores extras. */
export function ColorsGroup({ draft, update, palette }: GroupProps & { palette: Palette }): React.JSX.Element {
  const { tokens } = palette
  return (
    <EditorGroup title="Cores">
      {FILLS.map(({ field, label }) => (
        <FillField key={field} field={field} label={label} draft={draft} update={update} />
      ))}
      <div className="flex flex-col gap-1.5">
        <SubLabel>Texto</SubLabel>
        <ColorSwatch label="Texto" value={draft.text} onChange={(text) => update({ text }, 'text')} />
        <OptionalColor
          label="Texto secundário"
          field="textMuted"
          auto={tokens['text-secondary']}
          draft={draft}
          update={update}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <SubLabel>Detalhes</SubLabel>
        <OptionalColor label="Realce (links e seleção)" field="highlight" auto={tokens['text-link']} draft={draft} update={update} />
        <OptionalColor
          label="Bordas"
          field="border"
          auto={flatten(tokens['border-strong'], palette.opaque?.tokens['bg-primary'] ?? tokens['bg-primary'])}
          draft={draft}
          update={update}
        />
      </div>
    </EditorGroup>
  )
}
