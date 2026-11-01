import { ThemePreview } from './ThemePreview'

/** Um tema na grade de Aparência: radio com a miniatura, o nome e a descrição. */
export function ThemeCard({
  themeKey,
  scheme,
  label,
  description,
  selected,
  onSelect,
  action
}: {
  themeKey: string
  scheme?: 'dark' | 'light'
  label: string
  description?: string
  selected: boolean
  onSelect: () => void
  /** Botão ao lado do nome (ex.: editar um tema próprio); fica fora do <label>. */
  action?: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="group relative min-w-0">
      <label className="block cursor-pointer">
        <input
          type="radio"
          name="salinha-theme"
          value={themeKey}
          checked={selected}
          onChange={onSelect}
          className="peer sr-only"
        />
        <div
          className={`overflow-hidden rounded-lg border-2 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-brand peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-[var(--bg-primary)] ${
            selected ? 'border-brand' : 'border-subtle group-hover:border-strong'
          }`}
        >
          <ThemePreview themeKey={themeKey} scheme={scheme} />
        </div>
        <span
          className={`mt-1.5 flex items-center gap-1.5 text-ds-sm font-medium text-strong ${action ? 'pr-9' : ''}`}
        >
          <span
            aria-hidden="true"
            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
              selected ? 'border-brand bg-brand' : 'border-gray-500'
            }`}
          >
            {selected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
          </span>
          <span className="min-w-0 truncate">{label}</span>
        </span>
        {description && <span className="mt-0.5 block text-ds-xs text-gray-400">{description}</span>}
      </label>
      {action && <div className="absolute right-0 top-[6.5rem]">{action}</div>}
    </div>
  )
}
