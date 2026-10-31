import { ACTION_GROUPS, actionInfo } from '../lib/auditActions'
import type { AuditFilter } from '../lib/auditPages'

export interface ActorOption {
  id: string
  name: string
}

/** Filtros do registro: quem fez e o tipo de ação. */
export default function AuditLogFilters({
  filter,
  actors,
  onChange
}: {
  filter: AuditFilter
  actors: ActorOption[]
  onChange: (next: AuditFilter) => void
}): React.JSX.Element {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="flex min-w-0 flex-col gap-1.5 text-ds-sm font-medium text-secondary">
        Filtrar por usuário
        <select
          name="audit-actor"
          className="glass-input min-h-10"
          value={filter.actorId ?? ''}
          onChange={(e) => onChange({ ...filter, actorId: e.target.value })}
        >
          <option value="" className="bg-floating">
            Todos os usuários
          </option>
          {actors.map((a) => (
            <option key={a.id} value={a.id} className="bg-floating">
              {a.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-1.5 text-ds-sm font-medium text-secondary">
        Filtrar por ação
        <select
          name="audit-action"
          className="glass-input min-h-10"
          value={filter.action ?? ''}
          onChange={(e) => onChange({ ...filter, action: e.target.value })}
        >
          <option value="" className="bg-floating">
            Todas as ações
          </option>
          {ACTION_GROUPS.map((group) => (
            <optgroup key={group.label} label={group.label} className="bg-floating">
              {group.actions.map((action) => (
                <option key={action} value={action} className="bg-floating">
                  {actionInfo(action).label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
    </div>
  )
}
