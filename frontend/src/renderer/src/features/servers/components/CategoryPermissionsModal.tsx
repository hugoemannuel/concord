import type { Category } from '../api/categories'
import { deleteCategoryOverwrite, setCategoryOverwrite } from '../api/categories'
import { useServerAccess } from '../hooks/useServerAccess'
import OverwriteEditor from './OverwriteEditor'

/** As permissões da categoria: o mesmo editor do canal, valendo para os canais vinculados. */
export function CategoryPermissionsModal({ serverId, category, run, onClose }: {
  serverId: string
  /** A da lista: se outra pessoa mudar, o editor acompanha. */
  category: Category
  run: (operation: () => Promise<void>) => Promise<boolean>
  onClose: () => void
}): React.JSX.Element {
  const access = useServerAccess()
  return (
    <OverwriteEditor
      title={`Permissões de ${category.name}`}
      kind="category"
      privateLabel="Categoria privada"
      privateHint="Só os cargos e membros que você liberar abaixo veem esta categoria. Os canais vinculados, de texto e de voz, acompanham."
      emptyHint="Adicione um cargo ou membro para dar ou negar permissões nesta categoria."
      errorMessage="Não foi possível mudar as permissões da categoria."
      overwrites={category.overwrites}
      myPerms={access.perms}
      put={(o) => setCategoryOverwrite(serverId, category.id, o.target_type, o.target_id, o.allow, o.deny)}
      remove={(type, targetId) => deleteCategoryOverwrite(serverId, category.id, type, targetId)}
      refresh={() => run(async () => {})}
      onClose={onClose}
    />
  )
}
