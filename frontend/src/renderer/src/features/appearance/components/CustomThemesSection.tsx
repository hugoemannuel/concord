import IconButton from '../../../shared/ui/IconButton'
import { PencilIcon, PlusIcon } from '../../../shared/ui/icons'
import { useThemeStore } from '../../settings/store/themeStore'
import { customThemeKey, MAX_CUSTOM_THEMES } from '../lib/customThemes'
import { schemeOf } from '../lib/palette'
import { useCustomThemesStore } from '../store/customThemesStore'
import { startEditTheme, startNewTheme } from '../store/themeEditorFlow'
import { useThemeEditorStore } from '../store/themeEditorStore'
import { ThemeCard } from './ThemeCard'

/** Configurações → Aparência → Seus temas: os temas próprios, o "Criar tema" e o editor. */
export function CustomThemesSection(): React.JSX.Element {
  const themes = useCustomThemesStore((s) => s.themes)
  const preference = useThemeStore((s) => s.preference)
  const setPreference = useThemeStore((s) => s.setPreference)
  const editing = useThemeEditorStore((s) => s.history !== null)
  const full = themes.length >= MAX_CUSTOM_THEMES

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-ds-sm font-medium text-muted">Seus temas</legend>
      <p className="-mt-2 text-ds-sm text-muted">
        Crie um tema com as suas cores. Ele fica salvo na sua conta e aparece em todos os seus aparelhos.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {themes.map((theme) => {
          const key = customThemeKey(theme.id)
          return (
            <ThemeCard
              key={theme.id}
              themeKey={key}
              scheme={schemeOf(theme.background)}
              label={theme.name}
              selected={preference === key}
              onSelect={() => setPreference(key)}
              action={
                <IconButton icon={PencilIcon} label={`Editar ${theme.name}`} onClick={() => startEditTheme(theme.id)} />
              }
            />
          )
        })}
        <button
          type="button"
          disabled={full || editing}
          onClick={startNewTheme}
          className="focus-ring flex h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-normal text-ds-sm font-medium text-secondary transition-colors hover:border-strong hover:text-strong disabled:cursor-not-allowed disabled:opacity-50"
        >
          <PlusIcon size={20} />
          Criar tema
        </button>
      </div>
      {full && (
        <p className="text-ds-xs text-muted">Limite de {MAX_CUSTOM_THEMES} temas: apague um para criar outro.</p>
      )}
      {editing && (
        <p role="status" className="text-ds-xs text-muted">
          Editando no painel: cada mudança já aparece no app. Use o olho do painel para ver o app sem as configurações.
        </p>
      )}
    </fieldset>
  )
}
