import { useEffect, useRef, useState } from 'react'
import Button from '../../../shared/ui/Button'
import Input from '../../../shared/ui/Input'
import Switch from '../../../shared/ui/Switch'
import { CheckIcon, TrashIcon } from '../../../shared/ui/icons'
import { ChipGroup, ColorSwatch, EditorSection, SubLabel } from '../../settings/components/profile/controls'
import { THEMES, type ThemeId } from '../../settings/lib/themes'
import { DRAFT_KEY, type CustomThemeEditor as Editor, type Draft } from '../hooks/useCustomThemeEditor'
import { NAME_MAX, PRESET_SEEDS } from '../lib/customThemes'
import { adjustmentNotice } from '../lib/editorText'
import type { Palette, PaletteInput } from '../lib/palette'
import { ThemePreview } from './ThemePreview'

type ColorField = Exclude<keyof PaletteInput, 'glow'>

const COLOR_FIELDS: Array<{ field: ColorField; label: string }> = [
  { field: 'accent', label: 'Destaque' },
  { field: 'background', label: 'Fundo principal' },
  { field: 'sidebar', label: 'Barra lateral' },
  { field: 'card', label: 'Cartões e menus' },
  { field: 'text', label: 'Texto' }
]

const PRESET_CHIPS = THEMES.map((t) => ({ id: t.id, label: t.label }))

function GlowField({ draft, palette, update }: { draft: Draft; palette: Palette; update: Editor['update'] }): React.JSX.Element {
  const on = draft.glow !== ''
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-ds-sm font-medium text-strong">Brilho de fundo</span>
          <span className="block text-ds-xs text-muted">
            {palette.scheme === 'dark'
              ? 'Luzes suaves atrás dos painéis, que ficam um pouco transparentes.'
              : 'O brilho só aparece nos temas escuros.'}
          </span>
        </span>
        <Switch
          label="Brilho de fundo"
          checked={on}
          onChange={(checked) => update({ glow: checked ? draft.accent : '' })}
        />
      </div>
      {on && <ColorSwatch label="Cor do brilho" value={draft.glow} onChange={(glow) => update({ glow })} />}
    </div>
  )
}

function DeleteButton({ onConfirm }: { onConfirm: () => void }): React.JSX.Element {
  const [confirming, setConfirming] = useState(false)
  return (
    <Button
      variant={confirming ? 'danger' : 'ghost'}
      icon={TrashIcon}
      onClick={() => (confirming ? onConfirm() : setConfirming(true))}
      onBlur={() => setConfirming(false)}
    >
      {confirming ? 'Confirmar: apagar' : 'Apagar tema'}
    </Button>
  )
}

/** Editor de tema próprio: nome, ponto de partida, cores, brilho e a prévia ao vivo. */
export function CustomThemeEditor({
  editor,
  draft,
  palette
}: {
  editor: Editor
  draft: Draft
  palette: Palette
}): React.JSX.Element {
  const { update, saving, error } = editor
  const notice = adjustmentNotice(palette.adjusted)
  const ref = useRef<HTMLDivElement | null>(null)

  // Abriu o editor: rola até ele (no celular ele fica abaixo da grade).
  useEffect(() => {
    ref.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
  }, [draft.id])

  return (
    <div ref={ref}>
      <EditorSection
        title={draft.isNew ? 'Novo tema' : 'Editar tema'}
        description="Escolha poucas cores: o resto da paleta sai delas, sempre legível."
      >
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-3">
            <Input
              label="Nome"
              value={draft.name}
              maxLength={NAME_MAX}
              onChange={(e) => update({ name: e.target.value })}
            />
            <div className="flex flex-col gap-1">
              <SubLabel>Começar de</SubLabel>
              <ChipGroup
                label="Começar de um tema pronto"
                options={PRESET_CHIPS}
                value=""
                onPick={(id) => update(PRESET_SEEDS[id as ThemeId])}
                className="grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))]"
              />
            </div>
            <div className="flex flex-col gap-1">
              <SubLabel>Cores</SubLabel>
              <div className="grid grid-cols-1 gap-1.5 min-[400px]:grid-cols-2">
                {COLOR_FIELDS.map(({ field, label }) => (
                  <ColorSwatch key={field} label={label} value={draft[field]} onChange={(c) => update({ [field]: c })} />
                ))}
              </div>
            </div>
            <GlowField draft={draft} palette={palette} update={update} />
          </div>

          <div className="flex min-w-0 flex-col gap-2">
            <SubLabel>Prévia</SubLabel>
            <div className="overflow-hidden rounded-lg border-2 border-subtle">
              <ThemePreview themeKey={DRAFT_KEY} scheme={palette.scheme} className="h-32 sm:h-40" />
            </div>
            {notice && (
              <p role="status" className="text-ds-xs text-muted">
                {notice}
              </p>
            )}
          </div>
        </div>

        {error && (
          <p role="alert" className="text-ds-sm text-danger">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button icon={CheckIcon} loading={saving} onClick={() => void editor.submit()}>
            Salvar e usar
          </Button>
          <Button variant="ghost" onClick={editor.cancel}>
            Cancelar
          </Button>
          {!draft.isNew && (
            <span className="ml-auto">
              <DeleteButton onConfirm={() => void editor.removeDraft()} />
            </span>
          )}
        </div>
      </EditorSection>
    </div>
  )
}
