import { useMemo, useState } from 'react'
import { useServerStore } from '../../servers/store/serverStore'
import { useAuditLog } from '../hooks/useAuditLog'
import { useInfiniteSentinel } from '../hooks/useInfiniteSentinel'
import { actorOptions } from '../lib/auditActors'
import type { AuditFilter } from '../lib/auditPages'
import Button from '../../../shared/ui/Button'
import Spinner from '../../../shared/ui/Spinner'
import AuditLogFilters from './AuditLogFilters'
import AuditLogItem from './AuditLogItem'

function EmptyState({ filtered }: { filtered: boolean }): React.JSX.Element {
  return (
    <p className="rounded-lg border border-subtle px-4 py-6 text-center text-ds-sm text-muted">
      {filtered ? 'Nenhuma ação encontrada com esses filtros.' : 'Nada foi registrado ainda.'}
    </p>
  )
}

function ListFooter({
  loading,
  failed,
  hasMore,
  onMore,
  onRetry
}: {
  loading: boolean
  failed: boolean
  hasMore: boolean
  onMore: () => void
  onRetry: () => void
}): React.JSX.Element | null {
  if (loading) {
    return (
      <div className="flex justify-center py-3" role="status" aria-label="Carregando o registro">
        <Spinner />
      </div>
    )
  }
  if (failed) {
    return (
      <div className="flex flex-wrap items-center gap-3 text-ds-sm text-muted">
        Não foi possível carregar o registro de auditoria.
        <Button variant="ghost" size="sm" onClick={onRetry}>
          Tentar de novo
        </Button>
      </div>
    )
  }
  if (!hasMore) return null
  return (
    <Button variant="ghost" size="sm" className="self-center" onClick={onMore}>
      Carregar mais
    </Button>
  )
}

/**
 * Configurações do servidor > Registro de auditoria: quem fez cada ação de
 * moderação e administração, do mais recente para o mais antigo, com filtro
 * por usuário e por ação. Só abre com "Ver registro de auditoria" (o servidor
 * confere de novo).
 */
export default function AuditLogSection(): React.JSX.Element {
  const serverId = useServerStore((s) => s.currentServer?.id)
  const members = useServerStore((s) => s.currentMembers)
  const [filter, setFilter] = useState<AuditFilter>({})
  const log = useAuditLog(serverId, filter)
  const actors = useMemo(() => actorOptions(members), [members])
  const hasMore = log.next !== null
  const sentinel = useInfiniteSentinel(hasMore && !log.loading && !log.failed, log.entries.length, log.loadMore)
  const filtered = Boolean(filter.actorId || filter.action)

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <p className="text-ds-sm text-muted">
        As ações de moderação e administração dos últimos 90 dias: quem fez, o quê e quando.
      </p>
      <AuditLogFilters filter={filter} actors={actors} onChange={setFilter} />
      {log.entries.length > 0 && (
        <ul className="divide-y divide-subtle overflow-hidden rounded-lg border border-subtle" aria-label="Registro de auditoria">
          {log.entries.map((entry) => (
            <AuditLogItem key={entry.id} entry={entry} />
          ))}
        </ul>
      )}
      {!log.loading && !log.failed && log.entries.length === 0 && <EmptyState filtered={filtered} />}
      <div ref={sentinel} aria-hidden="true" />
      <ListFooter
        loading={log.loading}
        failed={log.failed}
        hasMore={hasMore}
        onMore={log.loadMore}
        onRetry={log.retry}
      />
    </div>
  )
}
