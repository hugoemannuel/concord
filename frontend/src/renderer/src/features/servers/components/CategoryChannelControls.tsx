import type { Category } from '../api/categories'
import { RefreshIcon } from '../../../shared/ui/icons'
import SidebarMenuItem from './SidebarMenuItem'

/**
 * No menu do canal: "Mover para categoria" (alternativa ao arrastar, com teclado e
 * toque) e, se o canal tem permissão própria, a opção de voltar a seguir a categoria.
 */
export function CategoryChannelControls({ channelName, categories, categoryId, unsynced, onCategory, onSync }: {
  channelName: string
  categories: Category[]
  categoryId: string | null
  unsynced: boolean
  onCategory: (id: string | null) => void
  /** Sem esta função, quem está vendo não pode sincronizar: fica só o aviso. */
  onSync?: () => void
}): React.JSX.Element {
  return (
    <>
      {unsynced && (
        <div className="mt-1 border-t border-subtle pt-1">
          <p className="px-2.5 py-1 text-ds-xs text-muted">Permissões próprias: este canal não segue a categoria.</p>
          {onSync && <SidebarMenuItem label="Sincronizar com a categoria" icon={<RefreshIcon className="h-3.5 w-3.5" />} onClick={onSync} />}
        </div>
      )}
      <label className="flex flex-col gap-1 px-2.5 py-2 text-ds-sm font-medium text-normal">
        Mover para categoria
        <select aria-label={`Mover ${channelName} para categoria`} value={categoryId ?? ''} onChange={(event) => onCategory(event.target.value || null)} className="focus-ring min-h-10 w-full min-w-0 rounded-md border border-subtle bg-secondary px-1 text-ds-sm text-normal sm:min-h-8">
          <option value="">Sem categoria</option>
          {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </select>
      </label>
    </>
  )
}
