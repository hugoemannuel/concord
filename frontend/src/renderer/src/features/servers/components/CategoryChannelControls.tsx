import type { Category } from '../api/categories'
import IconButton from '../../../shared/ui/IconButton'
import { ChevronDownIcon, ChevronUpIcon } from '../../../shared/ui/icons'

export function CategoryChannelControls({ channelId, categories, categoryId, index, count, onCategory, onMove }: {
  channelId: string
  categories: Category[]
  categoryId: string | null
  index: number
  count: number
  onCategory: (id: string | null) => void
  onMove: (to: number) => void
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-1 pl-2">
      <select aria-label={`Categoria do canal ${channelId}`} value={categoryId ?? ''} onChange={(event) => onCategory(event.target.value || null)} className="focus-ring min-w-0 flex-1 rounded-md border border-subtle bg-secondary px-1 py-1 text-ds-xs text-muted">
        <option value="">Sem categoria</option>
        {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
      </select>
      <IconButton icon={ChevronUpIcon} label="Mover canal para cima" size="md" disabled={index === 0} onClick={() => onMove(index - 1)} />
      <IconButton icon={ChevronDownIcon} label="Mover canal para baixo" size="md" disabled={index === count - 1} onClick={() => onMove(index + 1)} />
    </div>
  )
}
