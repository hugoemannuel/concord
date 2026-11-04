import { PROFILE_EFFECTS, type ProfileTheme } from '../../../../profile/lib/profileTheme'
import { effectOptions, levelLabel, withEffect } from '../../../lib/themeEditor'
import { ChipGroup, ColorSwatch, RangeField } from '../controls'
import { EFFECT_ICONS } from './effectIcons'

interface Props {
  value: ProfileTheme
  onChange: (next: ProfileTheme) => void
}

const EFFECT_CHIPS = PROFILE_EFFECTS.map((e) => ({ ...e, icon: EFFECT_ICONS[e.id] }))

export function EffectControls({ value, onChange }: Props): React.JSX.Element {
  const { tunable, color } = effectOptions(value)
  return (
    <>
      <ChipGroup
        label="Efeito"
        options={EFFECT_CHIPS}
        value={value.effect}
        onPick={(id) => onChange(withEffect(value, id))}
        className="grid-cols-[repeat(auto-fill,minmax(7rem,1fr))]"
      />
      {tunable && (
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
      )}
      {color && (
        <div className="flex flex-wrap items-center gap-2">
          <ColorSwatch
            label="Cor do efeito"
            value={color}
            onChange={(effect_color) => onChange({ ...value, effect_color })}
          />
          {value.effect_color && (
            <button
              type="button"
              onClick={() => onChange({ ...value, effect_color: '' })}
              className="min-h-10 cursor-pointer rounded-lg px-2 text-ds-xs text-link hover:underline"
            >
              Usar a cor original
            </button>
          )}
        </div>
      )}
    </>
  )
}
