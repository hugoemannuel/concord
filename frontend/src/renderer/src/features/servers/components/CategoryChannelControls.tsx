import type { Category } from '../api/categories'

/** No menu do canal: "Mover para categoria" (alternativa ao arrastar, com teclado e toque). */
export function CategoryChannelControls({ channelName, categories, categoryId, onCategory }: {
  channelName: string
  categories: Category[]
  categoryId: string | null
  onCategory: (id: string | null) => void
}): React.JSX.Element {
  return (
    <label className="flex flex-col gap-1 px-2.5 py-2 text-ds-sm font-medium text-normal">
      Mover para categoria
      <select aria-label={`Mover ${channelName} para categoria`} value={categoryId ?? ''} onChange={(event) => onCategory(event.target.value || null)} className="focus-ring min-h-10 w-full min-w-0 rounded-md border border-subtle bg-secondary px-1 text-ds-sm text-normal sm:min-h-8">
        <option value="">Sem categoria</option>
        {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
      </select>
    </label>
  )
}
