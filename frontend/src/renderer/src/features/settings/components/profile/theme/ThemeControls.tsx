import {
  PROFILE_BACKGROUNDS,
  PROFILE_BORDERS,
  withBackground,
  withBorder,
  type ProfileTheme
} from '../../../../profile/lib/profileTheme'
import {
  GRADIENT_DIRECTIONS,
  MAX_BORDER_WIDTH,
  PROFILE_BORDER_ANIMATIONS,
  PROFILE_TEXTURES
} from '../../../../profile/lib/profileThemeExtras'
import {
  BACKGROUND_COLOR_LABELS,
  BORDER_COLOR_LABELS,
  borderTunable
} from '../../../lib/themeEditor'
import { ChipGroup, ColorSwatch, RangeField, SubLabel } from '../controls'
import { gradientArrow } from './effectIcons'

interface Props {
  value: ProfileTheme
  onChange: (next: ProfileTheme) => void
}

const DIRECTION_CHIPS = GRADIENT_DIRECTIONS.map((d) => ({
  id: String(d.angle),
  label: d.label,
  icon: gradientArrow(d.angle),
  iconOnly: true
}))

/** As cores de uma lista (borda ou fundo), lado a lado. */
function Swatches({
  labels,
  colors,
  onChange
}: {
  labels: string[]
  colors: string[]
  onChange: (colors: string[]) => void
}): React.JSX.Element | null {
  if (labels.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {labels.map((label, i) => (
        <ColorSwatch
          key={label}
          label={label}
          value={colors[i] ?? '#5865f2'}
          onChange={(c) => onChange(colors.map((old, j) => (j === i ? c : old)))}
        />
      ))}
    </div>
  )
}

export function BorderControls({ value, onChange }: Props): React.JSX.Element {
  return (
    <>
      <ChipGroup
        label="Borda"
        options={PROFILE_BORDERS}
        value={value.border}
        onPick={(id) => onChange(withBorder(value, id))}
      />
      <Swatches
        labels={BORDER_COLOR_LABELS[value.border] ?? []}
        colors={value.border_colors}
        onChange={(border_colors) => onChange({ ...value, border_colors })}
      />
      {borderTunable(value) && (
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] sm:items-end">
          <RangeField
            label="Espessura"
            value={value.border_width}
            min={1}
            max={MAX_BORDER_WIDTH}
            display={`${value.border_width} px`}
            onChange={(border_width) => onChange({ ...value, border_width })}
          />
          <div className="flex min-w-0 flex-col gap-1">
            <SubLabel>Animação</SubLabel>
            <ChipGroup
              label="Animação da borda"
              options={PROFILE_BORDER_ANIMATIONS}
              value={value.border_animation}
              onPick={(border_animation) => onChange({ ...value, border_animation })}
              className="grid-cols-4"
            />
          </div>
        </div>
      )}
    </>
  )
}

export function BackgroundControls({ value, onChange }: Props): React.JSX.Element {
  return (
    <>
      <ChipGroup
        label="Fundo do perfil"
        options={PROFILE_BACKGROUNDS}
        value={value.background}
        onPick={(id) => onChange(withBackground(value, id))}
        className="grid-cols-2 sm:grid-cols-4"
      />
      <Swatches
        labels={BACKGROUND_COLOR_LABELS[value.background] ?? []}
        colors={value.background_colors}
        onChange={(background_colors) => onChange({ ...value, background_colors })}
      />
      {(value.background === 'gradient' || value.background === 'pride') && (
        <div className="flex flex-col gap-1">
          <SubLabel>Direção do degradê</SubLabel>
          <ChipGroup
            label="Direção do degradê"
            options={DIRECTION_CHIPS}
            value={String(value.background_angle)}
            onPick={(angle) => onChange({ ...value, background_angle: Number(angle) })}
            className="grid-cols-4 sm:grid-cols-8"
          />
        </div>
      )}
      <div className="flex flex-col gap-1">
        <SubLabel>Textura</SubLabel>
        <ChipGroup
          label="Textura do fundo"
          options={PROFILE_TEXTURES}
          value={value.texture}
          onPick={(texture) => onChange({ ...value, texture })}
          className="grid-cols-[repeat(auto-fill,minmax(5rem,1fr))]"
        />
      </div>
      {value.background !== 'default' && (
        <p className="text-ds-xs text-muted">
          O texto fica claro ou escuro sozinho, para dar para ler em qualquer cor.
        </p>
      )}
    </>
  )
}
