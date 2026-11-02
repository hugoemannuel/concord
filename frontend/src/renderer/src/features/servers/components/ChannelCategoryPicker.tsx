import { useId } from 'react'
import type { Category } from '../api/categories'
import { useCategories } from '../hooks/useCategories'

export function ChannelCategorySelect({ categories, value, onChange }: {
  categories: Category[]
  value: string
  onChange: (value: string) => void
}): React.JSX.Element {
  const id = useId()
  return <div>
    <label htmlFor={id} className="mb-1 block text-ds-sm font-medium text-muted">Categoria</label>
    <select id={id} name="category_id" className="focus-ring w-full rounded-md border border-subtle bg-secondary px-3 py-2 text-ds-md text-normal"
      value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">Sem categoria</option>
      {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
    </select>
  </div>
}

export default function ChannelCategoryPicker({ serverId, value, onChange }: {
  serverId: string
  value: string
  onChange: (value: string) => void
}): React.JSX.Element {
  const { layout } = useCategories(serverId, '')
  return <ChannelCategorySelect categories={layout?.categories ?? []} value={value} onChange={onChange} />
}
