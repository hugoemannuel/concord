import { useState } from 'react'
import Button from '../../../../shared/ui/Button'
import Input from '../../../../shared/ui/Input'
import { ChipGroup, ColorSwatch, SubLabel } from '../../../settings/components/profile/controls'
import { THEMES, type ThemeId } from '../../../settings/lib/themes'
import { NAME_MAX } from '../../lib/customThemes'
import { PRESET_SEEDS } from '../../lib/presetSeeds'
import { paletteFromColor, STARTERS } from '../../lib/starters'
import { EditorGroup } from './EditorGroup'
import type { GroupProps } from './types'

const STARTER_CHIPS = STARTERS.map((s) => ({ id: s.id, label: s.label }))

/** Nome, pontos de partida prontos e "gerar a partir de uma cor". */
export function StartGroup({ draft, update }: GroupProps): React.JSX.Element {
  const [base, setBase] = useState(draft.accent)
  return (
    <EditorGroup title="Nome e ponto de partida" defaultOpen={draft.isNew}>
      <Input
        label="Nome"
        value={draft.name}
        maxLength={NAME_MAX}
        autoComplete="off"
        onChange={(e) => update({ name: e.target.value }, 'name')}
      />
      <div className="flex flex-col gap-1.5">
        <SubLabel>Começar de</SubLabel>
        <ChipGroup
          label="Começar de uma ideia pronta"
          options={STARTER_CHIPS}
          value=""
          onPick={(id) => {
            const starter = STARTERS.find((s) => s.id === id)
            if (starter) update(starter.input, 'start')
          }}
          className="grid-cols-2 min-[400px]:grid-cols-3"
        />
        <select
          aria-label="Começar de um tema do app"
          value=""
          onChange={(e) => update(PRESET_SEEDS[e.target.value as ThemeId], 'start')}
          className="glass-input min-h-10 !py-2 text-ds-sm"
        >
          <option value="" disabled>
            Ou de um tema do app…
          </option>
          {THEMES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <SubLabel>Gerar a partir de uma cor</SubLabel>
        <div className="flex flex-wrap items-center gap-2">
          <ColorSwatch label="Cor base" value={base} onChange={setBase} />
          <Button size="sm" variant="secondary" onClick={() => update(paletteFromColor(base, 'dark'), 'generate')}>
            Gerar escuro
          </Button>
          <Button size="sm" variant="secondary" onClick={() => update(paletteFromColor(base, 'light'), 'generate')}>
            Gerar claro
          </Button>
        </div>
      </div>
    </EditorGroup>
  )
}
