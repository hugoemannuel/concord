import { ThemeCard } from '../../../appearance/components/ThemeCard'
import { THEMES } from '../../lib/themes'
import { useThemeStore } from '../../store/themeStore'
import { Toggle } from '../Toggle'

/** Configurações → Aparência: tema de cor (vale na hora e fica salvo neste computador). */
export function AppearanceSection(): React.JSX.Element {
  const preference = useThemeStore((s) => s.preference)
  const active = useThemeStore((s) => s.theme)
  const setPreference = useThemeStore((s) => s.setPreference)
  const followSystem = preference === 'system'
  const activeLabel = THEMES.find((t) => t.id === active)?.label ?? ''

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-subtle bg-fg/5 p-4">
        <Toggle
          title="Seguir o sistema"
          description={
            followSystem
              ? `Claro ou escuro conforme o sistema. Agora: ${activeLabel}.`
              : 'Usa Discord Claro ou Escuro conforme o modo do sistema.'
          }
          checked={followSystem}
          onChange={() => setPreference(followSystem ? active : 'system')}
        />
      </div>

      <fieldset>
        <legend className="mb-1 text-ds-sm font-medium text-gray-400">Tema</legend>
        <p className="mb-3 text-ds-sm text-gray-400">
          A cor muda na hora e fica salva só neste computador.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {THEMES.map((theme) => (
            <ThemeCard
              key={theme.id}
              themeKey={theme.id}
              label={theme.label}
              description={theme.description}
              selected={!followSystem && preference === theme.id}
              onSelect={() => setPreference(theme.id)}
            />
          ))}
        </div>
      </fieldset>
    </div>
  )
}
