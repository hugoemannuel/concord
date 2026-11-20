import { useState } from 'react'
import { showToast } from '../../../shared/store/toastStore'
import { actionErrorMessage } from '../lib/permissionErrors'
import type { Role } from '../lib/permissions'
import { isRoleDirty, roleDraft, roleInputFor, type RoleDraft, type RoleEdits } from '../lib/roleEdits'
import { useServerStore } from '../store/serverStore'

export interface RoleEditsState {
  draft: RoleDraft
  dirty: boolean
  saving: boolean
  /** Mexe num campo do rascunho. */
  change: <K extends keyof RoleEdits>(field: K, value: RoleEdits[K]) => void
  save: () => Promise<void>
  reset: () => void
}

/** O rascunho do editor de um cargo: o que foi mexido, salvar e redefinir. */
export function useRoleEdits(serverId: string, role: Role): RoleEditsState {
  const updateRole = useServerStore((s) => s.updateRole)
  const [edits, setEdits] = useState<RoleEdits>({})
  const [saving, setSaving] = useState(false)
  const draft = roleDraft(role, edits)

  const save = async (): Promise<void> => {
    setSaving(true)
    try {
      await updateRole(serverId, role.id, roleInputFor(role, draft))
      setEdits({})
      showToast.success('Cargo salvo!')
    } catch (err) {
      showToast.error(actionErrorMessage(err, 'Não foi possível salvar o cargo.'))
    } finally {
      setSaving(false)
    }
  }

  return {
    draft,
    dirty: isRoleDirty(role, draft),
    saving,
    change: (field, value) => setEdits((e) => ({ ...e, [field]: value })),
    save,
    reset: () => setEdits({})
  }
}
