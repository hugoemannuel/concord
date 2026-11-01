import Switch from '../../../../shared/ui/Switch'
import { ColorSwatch, RangeField } from '../../../settings/components/profile/controls'
import type { Scheme } from '../../lib/palette'
import { EditorGroup } from './EditorGroup'
import type { GroupProps } from './types'

function GlowFields({ draft, update, scheme }: GroupProps & { scheme: Scheme }): React.JSX.Element {
  const on = draft.glow !== ''
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-ds-sm font-medium text-strong">Brilho de fundo</span>
          <span className="block text-ds-xs text-muted">
            {scheme === 'dark' ? 'Luzes suaves que se movem atrás dos painéis.' : 'O brilho só aparece nos temas escuros.'}
          </span>
        </span>
        <Switch label="Brilho de fundo" checked={on} onChange={(c) => update({ glow: c ? draft.accent : '' }, 'glow-on')} />
      </div>
      {on && (
        <div className="grid gap-2 min-[400px]:grid-cols-[auto_minmax(0,1fr)] min-[400px]:items-end">
          <ColorSwatch label="Cor do brilho" value={draft.glow} onChange={(glow) => update({ glow }, 'glow')} />
          <RangeField
            label="Intensidade"
            value={draft.glowStrength}
            min={10}
            max={100}
            step={5}
            display={`${draft.glowStrength}%`}
            onChange={(glowStrength) => update({ glowStrength }, 'glowStrength')}
          />
        </div>
      )}
    </div>
  )
}

/** Brilho do fundo animado e o vidro (transparência + desfoque) dos painéis. */
export function EffectsGroup({ draft, update, scheme }: GroupProps & { scheme: Scheme }): React.JSX.Element {
  return (
    <EditorGroup title="Brilho e vidro">
      <GlowFields draft={draft} update={update} scheme={scheme} />
      <div className="flex flex-col gap-1">
        <RangeField
          label="Vidro"
          value={draft.glass}
          min={0}
          max={100}
          step={5}
          display={draft.glass === 0 ? 'Desligado' : `${draft.glass}%`}
          onChange={(glass) => update({ glass }, 'glass')}
        />
        <p className="text-ds-xs text-muted">
          Painéis transparentes e desfocados, com o fundo principal (e o degradê dele) aparecendo atrás. Fica opaco se o
          sistema pedir menos transparência.
        </p>
      </div>
    </EditorGroup>
  )
}
