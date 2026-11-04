import { useId, useState } from 'react'
import { ChevronDownIcon } from '../../../../../shared/ui/icons'
import { EFFECT_GROUPS } from '../../../../profile/lib/effectCatalog'
import { EFFECT_DIRECTIONS, EFFECT_PALETTES } from '../../../../profile/lib/effectLook'
import type { ProfileTheme } from '../../../../profile/lib/profileTheme'
import {
  effectOptions,
  effectTuning,
  glowLabel,
  levelLabel,
  withEffect,
  withOriginalColor
} from '../../../lib/themeEditor'
import { ChipGroup, ColorSwatch, RangeField, SubLabel } from '../controls'
import { EFFECT_ICONS, gradientArrow } from './effectIcons'

interface Props {
  value: ProfileTheme
  onChange: (next: ProfileTheme) => void
  /** Como chamar as áreas aqui: no fundo do app não há cartão nem banner. */
  areaLabels?: { full: string; banner: string }
}

const CARD_AREAS = { full: 'Cartão inteiro', banner: 'Só o banner' }
const ARROW_ANGLES: Record<string, number> = { up: 0, right: 90, down: 180, left: 270 }

const GROUPS = EFFECT_GROUPS.map((g) => ({
  id: g.id,
  label: g.label,
  chips: g.effects.map((e) => ({ id: e.id, label: e.label, icon: EFFECT_ICONS[e.id] }))
}))

/** A grade de efeitos, por grupo. */
function EffectPicker({ value, onChange }: Props): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2.5" role="group" aria-label="Efeito">
      {GROUPS.map((g) => (
        <div key={g.id} className="flex flex-col gap-1">
          <SubLabel>{g.label}</SubLabel>
          <ChipGroup
            label={g.label}
            options={g.chips}
            value={value.effect}
            onPick={(id) => onChange(withEffect(value, id))}
            className="grid-cols-[repeat(auto-fill,minmax(7rem,1fr))]"
          />
        </div>
      ))}
    </div>
  )
}

/** Cor única (com "usar a cor original"), duas cores ou arco-íris. */
function ColorFields({ value, onChange }: Props): React.JSX.Element | null {
  const { color } = effectOptions(value)
  const { palette, color2 } = effectTuning(value)
  if (!color) return null
  const custom = value.effect_color !== '' || value.effect_palette !== 'single'
  return (
    <div className="flex flex-col gap-2">
      {palette && (
        <div className="flex flex-col gap-1">
          <SubLabel>Mistura de cor</SubLabel>
          <ChipGroup
            label="Mistura de cor"
            options={EFFECT_PALETTES}
            value={value.effect_palette}
            onPick={(effect_palette) => onChange({ ...value, effect_palette })}
            className="grid-cols-3"
          />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {value.effect_palette !== 'rainbow' && (
          <ColorSwatch
            label="Cor do efeito"
            value={color}
            onChange={(effect_color) => onChange({ ...value, effect_color })}
          />
        )}
        {palette && value.effect_palette === 'duo' && (
          <ColorSwatch
            label="Segunda cor"
            value={color2}
            onChange={(effect_color2) => onChange({ ...value, effect_color2 })}
          />
        )}
        {custom && (
          <button
            type="button"
            onClick={() => onChange(withOriginalColor(value))}
            className="focus-ring min-h-10 cursor-pointer rounded-lg px-2 text-ds-xs text-link hover:underline"
          >
            Usar a cor original
          </button>
        )}
      </div>
    </div>
  )
}

function directionChips(ids: readonly string[]): {
  id: string
  label: string
  icon?: ReturnType<typeof gradientArrow>
  iconOnly?: boolean
}[] {
  return EFFECT_DIRECTIONS.filter((d) => ids.includes(d.id)).map((d) =>
    d.id === 'default'
      ? { id: d.id, label: d.label }
      : { id: d.id, label: d.label, icon: gradientArrow(ARROW_ANGLES[d.id]), iconOnly: true }
  )
}

/** Tamanho, opacidade, brilho, direção e área: só o que o efeito expõe. */
function MoreFields({ value, onChange, areaLabels = CARD_AREAS }: Props): React.JSX.Element {
  const { size, glow, directions } = effectTuning(value)
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {size && (
          <RangeField
            label="Tamanho"
            value={value.effect_size}
            min={1}
            max={100}
            display={levelLabel(value.effect_size)}
            onChange={(effect_size) => onChange({ ...value, effect_size })}
          />
        )}
        <RangeField
          label="Opacidade"
          value={value.effect_opacity}
          min={10}
          max={100}
          step={5}
          display={`${value.effect_opacity}%`}
          onChange={(effect_opacity) => onChange({ ...value, effect_opacity })}
        />
        {glow && (
          <RangeField
            label="Brilho"
            value={value.effect_glow}
            min={0}
            max={100}
            step={5}
            display={glowLabel(value.effect_glow)}
            onChange={(effect_glow) => onChange({ ...value, effect_glow })}
          />
        )}
      </div>
      {directions.length > 0 && (
        <div className="flex flex-col gap-1">
          <SubLabel>Direção</SubLabel>
          <ChipGroup
            label="Direção do efeito"
            options={directionChips(directions)}
            value={value.effect_direction}
            onPick={(effect_direction) => onChange({ ...value, effect_direction })}
            className="grid-cols-[repeat(auto-fit,minmax(2.75rem,1fr))]"
          />
        </div>
      )}
      <div className="flex flex-col gap-1">
        <SubLabel>Onde aparece</SubLabel>
        <ChipGroup
          label="Onde o efeito aparece"
          options={[
            { id: 'full', label: areaLabels.full },
            { id: 'banner', label: areaLabels.banner }
          ]}
          value={value.effect_area}
          onPick={(effect_area) => onChange({ ...value, effect_area })}
          className="grid-cols-2"
        />
      </div>
    </div>
  )
}

/** "Mais opções": recolhido por padrão, para o painel não virar uma parede. */
function MoreOptions(props: Props): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        className="focus-ring flex min-h-10 w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-subtle bg-fg/5 px-2.5 text-left text-ds-xs font-medium text-secondary transition-colors hover:bg-fg/10 hover:text-strong"
      >
        Mais opções
        <ChevronDownIcon size={16} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <div id={id} hidden={!open}>
        <MoreFields {...props} />
      </div>
    </div>
  )
}

export function EffectControls(props: Props): React.JSX.Element {
  const { value, onChange } = props
  const { tunable } = effectOptions(value)
  return (
    <>
      <EffectPicker {...props} />
      {tunable && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <RangeField
              label="Quantidade"
              value={value.effect_density}
              min={1}
              max={100}
              display={levelLabel(value.effect_density)}
              onChange={(effect_density) => onChange({ ...value, effect_density })}
            />
            <RangeField
              label="Velocidade"
              value={value.effect_speed}
              min={1}
              max={100}
              display={levelLabel(value.effect_speed)}
              onChange={(effect_speed) => onChange({ ...value, effect_speed })}
            />
          </div>
          <ColorFields {...props} />
          <MoreOptions {...props} />
        </>
      )}
    </>
  )
}
