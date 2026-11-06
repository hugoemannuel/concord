import { PlusIcon, SearchIcon } from '../../../shared/ui/icons'
import Button from '../../../shared/ui/Button'
import SoundboardVolumeBar from './SoundboardVolumeBar'

/** Topo da mesa de áudio: enviar som, volume e a busca. */
export default function SoundboardHeader({
  canAdd,
  query,
  onQuery,
  onAdd
}: {
  canAdd: boolean
  query: string
  onQuery: (query: string) => void
  onAdd: () => void
}): React.JSX.Element {
  return (
    <div className="shrink-0">
      {canAdd && (
        <div className="mb-3 flex justify-end">
          <Button type="button" size="sm" icon={PlusIcon} onClick={onAdd}>
            Adicionar som
          </Button>
        </div>
      )}

      <SoundboardVolumeBar />

      <div className="relative mb-3">
        <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          type="text"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Buscar som na mesa…"
          className="w-full rounded-xl border border-subtle bg-input py-1.5 pl-8 pr-3 text-ds-xs text-strong placeholder:text-faint focus:border-brand focus:outline-none"
        />
      </div>
    </div>
  )
}
