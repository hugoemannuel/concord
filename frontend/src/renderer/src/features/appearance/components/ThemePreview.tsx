/**
 * Miniatura do app pintada com um tema: o data-theme no cartão faz os tokens
 * (bg-primary, text-normal…) valerem só ali dentro. Serve aos temas prontos,
 * aos próprios e à prévia ao vivo do editor.
 */
export function ThemePreview({
  themeKey,
  scheme,
  className = 'h-24'
}: {
  /** O data-theme: id do tema pronto ou "custom-<id>". */
  themeKey: string
  /** Só nos temas próprios: claro ou escuro (ver assets/theme.css, LEGADO). */
  scheme?: 'dark' | 'light'
  className?: string
}): React.JSX.Element {
  return (
    <div
      data-theme={themeKey}
      data-scheme={scheme}
      aria-hidden="true"
      className={`flex overflow-hidden bg-app ${className}`}
    >
      {/* Trilho de servidores */}
      <div className="flex w-6 shrink-0 flex-col items-center gap-1 bg-tertiary pt-1.5">
        <span className="h-3.5 w-3.5 rounded-md bg-brand" />
        <span className="h-3.5 w-3.5 rounded-full bg-surface" />
        <span className="h-3.5 w-3.5 rounded-full bg-surface" />
      </div>
      {/* Canais */}
      <div className="flex w-14 shrink-0 flex-col gap-1 bg-secondary p-1.5">
        <span className="h-1.5 w-8 rounded-full bg-fg/15" />
        <span className="rounded bg-selected px-1 text-ds-xxs leading-3 font-medium text-interactive-active">
          # geral
        </span>
        <span className="px-1 text-ds-xxs leading-3 text-interactive-normal"># jogos</span>
      </div>
      {/* Chat */}
      <div className="flex min-w-0 flex-1 flex-col justify-between bg-primary p-1.5">
        <div className="flex gap-1">
          <span className="h-3.5 w-3.5 shrink-0 rounded-full bg-success" />
          <span className="min-w-0 leading-none">
            <span className="block truncate text-ds-xxs font-semibold text-strong">
              Ana <span className="font-normal text-faint">agora</span>
            </span>
            <span className="block truncate text-ds-xxs text-normal">Bora jogar hoje?</span>
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="h-3 min-w-0 flex-1 rounded border border-normal bg-input" />
          <span className="rounded bg-brand px-1 text-ds-xxs leading-3 font-semibold text-white">
            Enviar
          </span>
        </div>
      </div>
    </div>
  )
}
