import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchRoleSettings, type RoleSetting } from '../api/events'
import { persistRoleChange, withAction, type RoleAction } from '../lib/roleSettings'

/**
 * A configuração dos eventos por cargo: a lista (undefined até carregar), o erro,
 * e `toggle`, que muda a tela na hora e volta atrás se o servidor recusar.
 */
export function useRoleSettings(serverId: string): {
  roles: RoleSetting[] | undefined
  error: string | null
  saving: boolean
  toggle: (roleId: string, action: RoleAction, value: boolean) => Promise<void>
  reload: () => void
} {
  const [roles, setRoles] = useState<RoleSetting[] | undefined>()
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const current = useRef<RoleSetting[] | undefined>(undefined)
  current.current = roles

  const reload = useCallback((): void => {
    setError(null)
    fetchRoleSettings(serverId)
      .then(setRoles)
      .catch(() => setError('Não foi possível carregar os cargos.'))
  }, [serverId])

  useEffect(reload, [reload])

  const toggle = async (roleId: string, action: RoleAction, value: boolean): Promise<void> => {
    const before = current.current
    if (!before) return
    const next = withAction(before, roleId, action, value)
    setRoles(next)
    setSaving(true)
    setError(null)
    const failure = await persistRoleChange(serverId, next, roleId)
    if (failure) {
      setRoles(before)
      setError(failure)
    }
    setSaving(false)
  }

  return { roles, error, saving, toggle, reload }
}
