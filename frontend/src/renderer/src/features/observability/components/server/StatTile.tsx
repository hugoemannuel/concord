/**
 * Número de resumo no topo de um bloco. `warn`: o valor passou do limite (a
 * dica diz qual); a cor nunca vem sozinha.
 */
export function StatTile({
  label,
  value,
  hint,
  warn = false
}: {
  label: string
  value: string
  hint?: string
  warn?: boolean
}): React.JSX.Element {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-lg bg-surface p-3">
      <span className="text-ds-sm text-muted">{label}</span>
      <span
        className={`text-ds-lg font-semibold tabular-nums ${warn ? 'text-warning' : 'text-strong'}`}
      >
        {value}
      </span>
      {hint && <span className={`text-ds-xs ${warn ? 'text-warning' : 'text-muted'}`}>{hint}</span>}
    </div>
  )
}

/** Grade dos números: 2 colunas no celular, 4 em telas largas. */
export function TileGrid({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">{children}</div>
}

/** Grade dos gráficos: um por linha no celular, dois em telas largas. */
export function ChartGrid({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <div className="grid gap-3 lg:grid-cols-2">{children}</div>
}
