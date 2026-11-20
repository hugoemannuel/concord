import { useMemo, useState } from 'react'
import { useServerStore } from '../store/serverStore'
import { useServerAccess } from '../hooks/useServerAccess'
import { showToast } from '../../../shared/store/toastStore'
import { actionErrorMessage } from '../lib/permissionErrors'
import { roleColorCss, type Role } from '../lib/permissions'
import { moveRoleId } from '../lib/roleList'
import Button from '../../../shared/ui/Button'
import { ChevronDownIcon, ChevronUpIcon, PlusIcon } from '../../../shared/ui/icons'
import RoleEditor from './RoleEditor'

/** Cargos: lista com hierarquia à esquerda e editor (exibição, permissões, membros) à direita. */
function RolesSection(): React.JSX.Element {
  const serverId = useServerStore((s) => s.currentServer?.id)
  const roles = useServerStore((s) => s.roles)
  const members = useServerStore((s) => s.currentMembers)
  const createRole = useServerStore((s) => s.createRole)
  const reorderRoles = useServerStore((s) => s.reorderRoles)
  const access = useServerAccess()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const selected = roles.find((r) => r.id === selectedId) ?? roles[0]
  const orderable = roles.filter((r) => !r.is_default && !r.is_system)
  const counts = useMemo(() => {
    const map: Record<string, number> = {}
    for (const m of members) for (const id of m.role_ids ?? []) map[id] = (map[id] ?? 0) + 1
    return map
  }, [members])

  if (!serverId) return <p className="text-sm text-gray-400">Abra um servidor primeiro.</p>

  const create = async (): Promise<void> => {
    setBusy(true)
    try {
      const role = await createRole(serverId, { name: 'novo cargo' })
      setSelectedId(role.id)
    } catch (err) {
      showToast.error(actionErrorMessage(err, 'Não foi possível criar o cargo.'))
    } finally {
      setBusy(false)
    }
  }

  const move = async (role: Role, direction: -1 | 1): Promise<void> => {
    const ids = orderable.map((r) => r.id)
    const neighbor = ids[ids.indexOf(role.id) + direction]
    if (!neighbor) return
    try {
      await reorderRoles(serverId, moveRoleId(ids, role.id, neighbor))
    } catch (err) {
      showToast.error(actionErrorMessage(err, 'Não foi possível mudar a ordem.'))
    }
  }

  const canMove = (role: Role, direction: -1 | 1): boolean => {
    if (role.is_default || role.is_system || !access.canManage(role)) return false
    const index = orderable.findIndex((r) => r.id === role.id)
    const neighbor = orderable[index + direction]
    return !!neighbor && access.canManage(neighbor)
  }

  return (
    <div className="flex flex-col gap-6 md:flex-row">
      <div className="w-full md:w-[230px] md:shrink-0">
        <Button
          variant="primary"
          className="mb-3 flex w-full items-center justify-center gap-1.5 py-1.5 text-xs"
          onClick={() => void create()}
          disabled={busy}
        >
          <PlusIcon className="h-4 w-4" />
          Criar cargo
        </Button>
        <p className="mb-2 text-xs leading-snug text-gray-500">
          Quem está mais acima na lista manda nos de baixo. Você só mexe nos cargos abaixo do seu
          mais alto.
        </p>
        <ul className="flex flex-col gap-0.5">
          {roles.map((role) => (
            <li key={role.id} className="group flex items-center gap-1">
              <button
                type="button"
                onClick={() => setSelectedId(role.id)}
                aria-current={selected?.id === role.id ? 'true' : undefined}
                className={`flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium transition-colors ${
                  selected?.id === role.id
                    ? 'bg-fg/10 text-strong'
                    : 'text-gray-400 hover:bg-fg/5 hover:text-gray-200'
                }`}
              >
                <span
                  aria-hidden
                  className="h-3 w-3 shrink-0 rounded-full border border-normal"
                  style={{ background: roleColorCss(role.color) ?? 'transparent' }}
                />
                <span className="min-w-0 flex-1 truncate">{role.name}</span>
                {!role.is_default && (
                  <span className="shrink-0 text-ds-xs text-gray-500">{counts[role.id] ?? 0}</span>
                )}
              </button>
              {!role.is_default && !role.is_system && (
                <span className="flex shrink-0 flex-col transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:focus-within:opacity-100">
                  <button
                    type="button"
                    aria-label={`Subir ${role.name}`}
                    disabled={!canMove(role, -1)}
                    onClick={() => void move(role, -1)}
                    className="cursor-pointer rounded text-gray-400 hover:text-strong disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <ChevronUpIcon className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Descer ${role.name}`}
                    disabled={!canMove(role, 1)}
                    onClick={() => void move(role, 1)}
                    className="cursor-pointer rounded text-gray-400 hover:text-strong disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <ChevronDownIcon className="h-3.5 w-3.5" />
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="min-w-0 flex-1">
        {selected ? (
          <RoleEditor key={selected.id} serverId={serverId} role={selected} />
        ) : (
          <p className="text-sm text-gray-400">Nenhum cargo ainda.</p>
        )}
      </div>
    </div>
  )
}

export default RolesSection
