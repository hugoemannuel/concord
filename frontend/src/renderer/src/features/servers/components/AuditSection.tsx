import { useState } from 'react'
import { useServerStore } from '../store/serverStore'
import { useAuditLog } from '../hooks/useAuditLog'
import { AUDIT_ACTIONS, auditValue } from '../lib/audit'

function AuditSection(): React.JSX.Element | null {
  const serverId = useServerStore((state) => state.currentServer?.id)
  if (!serverId) return null
  return <AuditServer key={serverId} serverId={serverId} />
}

function AuditServer({ serverId }: { serverId: string }): React.JSX.Element {
  const members = useServerStore((state) => state.currentMembers)
  const [actor, setActor] = useState('')
  const [action, setAction] = useState('')
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
          Responsável
          <select value={actor} onChange={(event) => setActor(event.target.value)} className="w-full rounded border border-subtle bg-transparent p-2">
            <option value="">Todos</option>
            {members.map((member) => <option key={member.user_id} value={member.user_id}>{member.display_name || member.username || member.user_id}</option>)}
          </select>
        </label>
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
          Ação
          <select value={action} onChange={(event) => setAction(event.target.value)} className="w-full rounded border border-subtle bg-transparent p-2">
            <option value="">Todas</option>
            {Object.entries(AUDIT_ACTIONS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>
      </div>
      <AuditResults key={`${serverId}:${actor}:${action}`} serverId={serverId} actor={actor} action={action} />
    </div>
  )
}

function AuditResults({ serverId, actor, action }: { serverId: string; actor: string; action: string }): React.JSX.Element {
  const { page, error, loading, retry, more } = useAuditLog(serverId, actor, action)
  if (error) return <p role="alert">Não foi possível carregar o registro. <button type="button" onClick={retry}>Tentar novamente</button></p>
  if (!page) return <p role="status">Carregando registro…</p>
  if (!page.entries.length) return <p>Nenhum registro encontrado.</p>
  return (
    <div className="space-y-3">
      <ul className="divide-y divide-subtle rounded-lg border border-subtle">
        {page.entries.map((entry) => (
          <li key={entry.id} className="p-3">
            <details>
              <summary className="cursor-pointer break-words">
                <strong>{entry.actor_name || entry.actor_id || 'Sistema'}</strong>{' · '}
                {AUDIT_ACTIONS[entry.action] || entry.action}{' · '}
                {entry.target_name || entry.target_id}{' · '}
                <time dateTime={entry.created_at}>{new Date(entry.created_at).toLocaleString('pt-BR')}</time>
                {entry.result === 'partial' && ' · Ação parcial'}
              </summary>
              {entry.changes.map((change, index) => (
                <p key={`${change.field}:${index}`} className="mt-2 break-words text-sm">
                  {change.field}: {auditValue(change.before)} → {auditValue(change.after)}
                </p>
              ))}
            </details>
          </li>
        ))}
      </ul>
      {page.next_before !== null && <button type="button" disabled={loading} onClick={more}>{loading ? 'Carregando…' : 'Carregar mais'}</button>}
    </div>
  )
}

export default AuditSection
