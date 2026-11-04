import { ALL_PERMISSIONS, Perm } from '../lib/permissions'
import { PERMISSION_GROUPS, type PermissionGroup } from '../lib/permissionCatalog'
import Switch from '../../../shared/ui/Switch'

interface PermissionSwitchesProps {
  /** Permissões ligadas (bits). */
  value: number
  onChange: (next: number) => void
  /** Pode ligar/desligar esse bit? Quem não tem uma permissão não a dá a outros. */
  canToggle: (bit: number) => boolean
  groups?: PermissionGroup[]
}

export interface ItemState {
  allowed: boolean
  checked: boolean
  title?: string
}

export function computeItemState(
  bit: number,
  isCurrentAdmin: boolean,
  isAdminActive: boolean,
  currentValue: number,
  canToggle: (bit: number) => boolean
): ItemState {
  if (isCurrentAdmin) {
    const allowed = canToggle(bit)
    return {
      allowed,
      checked: isAdminActive,
      title: allowed ? undefined : 'Você não tem essa permissão para dar a outros.'
    }
  }

  const allowed = !isAdminActive && canToggle(bit)
  const checked = isAdminActive || (currentValue & bit) !== 0
  const title = isAdminActive
    ? 'Desabilitado para edição pois Administrador está ativo.'
    : allowed
      ? undefined
      : 'Você não tem essa permissão para dar a outros.'

  return { allowed, checked, title }
}

export function nextPermissionsValue(
  value: number,
  bit: number,
  isCurrentAdmin: boolean,
  nextChecked: boolean
): number {
  if (isCurrentAdmin) {
    const next = nextChecked ? value | Perm.ADMINISTRATOR | ALL_PERMISSIONS : value & ~Perm.ADMINISTRATOR
    return next >>> 0
  }
  return (nextChecked ? value | bit : value & ~bit) >>> 0
}

/** Um interruptor por permissão, agrupados (Administrador, Geral, Membros, Texto, Voz). */
function PermissionSwitches({
  value,
  onChange,
  canToggle,
  groups = PERMISSION_GROUPS
}: PermissionSwitchesProps): React.JSX.Element {
  const isAdminActive = (value & Perm.ADMINISTRATOR) !== 0

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <section key={group.title}>
          <h3 className="mb-2 text-ds-sm font-medium text-muted">{group.title}</h3>
          <ul className="divide-y divide-subtle rounded-lg border border-subtle bg-fg/3">
            {group.permissions.map((p) => {
              const bit = Perm[p.name]
              const isCurrentAdmin = p.name === 'ADMINISTRATOR'
              const { allowed, checked, title } = computeItemState(
                bit,
                isCurrentAdmin,
                isAdminActive,
                value,
                canToggle
              )

              return (
                <li
                  key={p.name}
                  className={`flex items-center justify-between gap-4 px-4 py-3 ${
                    allowed ? '' : 'opacity-50'
                  }`}
                  title={title}
                >
                  <div className="min-w-0">
                    <p className="text-ds-sm font-semibold text-strong">{p.label}</p>
                    <p className="text-ds-xs leading-snug text-muted">{p.description}</p>
                  </div>
                  <Switch
                    checked={checked}
                    label={p.label}
                    disabled={!allowed}
                    onChange={(on) =>
                      onChange(nextPermissionsValue(value, bit, isCurrentAdmin, on))
                    }
                  />
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}

export default PermissionSwitches
