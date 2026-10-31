import Button from '../../../shared/ui/Button'
import Switch from '../../../shared/ui/Switch'
import { useServerStore } from '../../servers/store/serverStore'
import type { RoleSetting } from '../api/events'
import { useEventAccess } from '../hooks/useEventAccess'
import { useRoleSettings } from '../hooks/useRoleSettings'
import { ROLE_ACTIONS } from '../lib/roleSettings'

function RoleCard({
  role,
  isOwner,
  saving,
  onToggle
}: {
  role: RoleSetting
  isOwner: boolean
  saving: boolean
  onToggle: (action: (typeof ROLE_ACTIONS)[number]['key'], value: boolean) => void
}): React.JSX.Element {
  return (
    <li className="rounded-lg border border-subtle bg-fg/5 p-3">
      <h3 className="mb-1 break-words text-ds-md font-semibold text-strong">{role.name}</h3>
      <ul className="flex flex-col">
        {ROLE_ACTIONS.map((a) => (
          <li key={a.key} className="flex min-h-11 items-center justify-between gap-3">
            <span className="text-ds-sm text-normal">{a.label}</span>
            <Switch
              checked={role[a.key]}
              label={`${role.name}: ${a.label}`}
              disabled={saving || Boolean(a.ownerOnly && !isOwner)}
              onChange={(value) => onToggle(a.key, value)}
            />
          </li>
        ))}
      </ul>
    </li>
  )
}

/**
 * Configurações do servidor, seção Eventos: o dono (e os cargos a que ele deu
 * "Configurar eventos") escolhe o que cada cargo faz com os eventos. Vale para
 * todos os eventos do servidor.
 */
export default function EventsSettingsSection(): React.JSX.Element {
  const serverId = useServerStore((s) => s.currentServer?.id)
  if (!serverId) return <p className="text-ds-sm text-muted">Abra um servidor primeiro.</p>
  return <Loaded serverId={serverId} />
}

function Loaded({ serverId }: { serverId: string }): React.JSX.Element {
  const { roles, error, saving, toggle, reload } = useRoleSettings(serverId)
  const isOwner = Boolean(useEventAccess(serverId)?.owner)

  if (roles === undefined && error) {
    return (
      <div role="alert" className="flex flex-col items-start gap-2 rounded-lg border border-danger/20 bg-danger/10 p-3">
        <p className="text-ds-sm text-danger">{error}</p>
        <Button variant="ghost" onClick={reload}>
          Tentar de novo
        </Button>
      </div>
    )
  }
  if (roles === undefined) {
    return (
      <p role="status" className="text-ds-sm text-muted">
        Carregando cargos…
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="text-ds-sm text-secondary">
        Escolha o que cada cargo pode fazer com os eventos. Vale para todos os eventos do servidor; o dono
        do servidor sempre pode tudo.
      </p>
      {!isOwner && (
        <p className="text-ds-xs text-muted">Só o dono do servidor liga ou desliga Configurar eventos.</p>
      )}
      {error && (
        <div role="alert" className="rounded-lg border border-danger/20 bg-danger/10 p-2.5 text-ds-xs text-danger">
          {error}
        </div>
      )}
      {roles.length === 0 ? (
        <p className="text-ds-sm text-muted">
          Este servidor ainda não tem cargos. Crie cargos na seção Cargos para liberar os eventos para eles.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {roles.map((r) => (
            <RoleCard
              key={r.role_id}
              role={r}
              isOwner={isOwner}
              saving={saving}
              onToggle={(action, value) => void toggle(r.role_id, action, value)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
