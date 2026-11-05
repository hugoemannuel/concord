import { useState } from 'react'
import { useServerStore } from '../store/serverStore'
import { useServerAccess } from '../hooks/useServerAccess'
import { showToast } from '../../../shared/store/toastStore'
import { actionErrorMessage } from '../lib/permissionErrors'
import type { Role } from '../lib/permissions'
import { serverDisplayName } from '../lib/serverNames'
import Avatar from '../../../shared/ui/Avatar'
import Button from '../../../shared/ui/Button'
import Input from '../../../shared/ui/Input'

/** Aba "Membros" do cargo: quem tem o cargo e a busca para adicionar mais gente. */
function RoleMembers({
  serverId,
  role,
  manageable
}: {
  serverId: string
  role: Role
  manageable: boolean
}): React.JSX.Element {
  const members = useServerStore((s) => s.currentMembers)
  const addMemberRole = useServerStore((s) => s.addMemberRole)
  const removeMemberRole = useServerStore((s) => s.removeMemberRole)
  const access = useServerAccess()
  const [query, setQuery] = useState('')

  const nameOf = (m: (typeof members)[number]): string => serverDisplayName(m, m)
  const withRole = members.filter((m) => m.role_ids?.includes(role.id))
  const term = query.trim().toLowerCase()
  // Os cargos do dono só o próprio dono mexe.
  const candidates = members
    .filter((m) => !m.role_ids?.includes(role.id) && access.canEditRolesOf(m.user_id))
    .filter((m) => !term || nameOf(m).toLowerCase().includes(term))
    .slice(0, 8)

  const run = async (action: () => Promise<void>): Promise<void> => {
    try {
      await action()
    } catch (err) {
      showToast.error(actionErrorMessage(err, 'Não foi possível mudar o cargo da pessoa.'))
    }
  }

  return (
    <div className="space-y-6">
      {manageable && !role.is_system && (
        <div>
          <Input
            label="Adicionar membros"
            placeholder="Buscar por nome"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {term && (
            <ul className="mt-2 divide-y divide-subtle rounded-lg border border-subtle">
              {candidates.length === 0 && (
                <li className="px-3 py-2 text-ds-xs text-faint">Ninguém encontrado.</li>
              )}
              {candidates.map((m) => (
                <li key={m.user_id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <Avatar
                      userId={m.user_id}
                      name={nameOf(m)}
                      avatarUrl={m.avatar_url}
                      decorationUrl={m.avatar_decoration_url}
                      size={24}
                    />
                    <span className="truncate text-ds-sm text-strong">{nameOf(m)}</span>
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void run(() => addMemberRole(serverId, m.user_id, role.id))}
                  >
                    Adicionar
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div>
        <h3 className="mb-2 text-ds-sm font-medium text-muted">
          Com este cargo — {withRole.length}
        </h3>
        {withRole.length === 0 ? (
          <p className="text-ds-sm text-faint">Ninguém tem este cargo ainda.</p>
        ) : (
          <ul className="divide-y divide-subtle rounded-lg border border-subtle">
            {withRole.map((m) => (
              <li key={m.user_id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="flex min-w-0 items-center gap-2">
                  <Avatar userId={m.user_id} name={nameOf(m)} avatarUrl={m.avatar_url} decorationUrl={m.avatar_decoration_url} size={24} />
                  <span className="truncate text-ds-sm text-strong">{nameOf(m)}</span>
                </span>
                {manageable && !role.is_system && access.canEditRolesOf(m.user_id) && (
                  <button
                    type="button"
                    onClick={() => void run(() => removeMemberRole(serverId, m.user_id, role.id))}
                    className="cursor-pointer text-ds-xs font-semibold text-danger hover:text-danger"
                  >
                    Remover
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export default RoleMembers
