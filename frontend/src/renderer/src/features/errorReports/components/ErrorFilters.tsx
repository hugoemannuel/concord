import Button from '../../../shared/ui/Button'
import type { ErrorSource } from '../api/errorReports'
import { SOURCE_OPTIONS } from '../lib/errorPanelFormat'
import { versionOptions } from '../lib/errorPanelState'

/** Filtros da aba Erros: origem (botões) e versão (das versões vistas no período). */
export function ErrorFilters({
  source,
  version,
  versions,
  onSource,
  onVersion
}: {
  source: ErrorSource | ''
  version: string
  versions: string[]
  onSource: (source: ErrorSource | '') => void
  onVersion: (version: string) => void
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div role="group" aria-label="Origem" className="flex flex-wrap gap-1">
        {SOURCE_OPTIONS.map((o) => (
          <Button
            key={o.value}
            variant={o.value === source ? 'primary' : 'secondary'}
            aria-pressed={o.value === source}
            onClick={() => onSource(o.value)}
          >
            {o.label}
          </Button>
        ))}
      </div>
      <label className="flex min-w-0 flex-col gap-1.5 text-ds-sm font-medium text-secondary md:w-52">
        Versão
        <select
          name="error-version"
          className="glass-input min-h-10"
          value={version}
          onChange={(e) => onVersion(e.target.value)}
        >
          <option value="" className="bg-floating">
            Todas as versões
          </option>
          {versionOptions(versions, version).map((v) => (
            <option key={v} value={v} className="bg-floating">
              {v}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
