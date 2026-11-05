import type { ReactNode } from 'react'
import Button from '../../../shared/ui/Button'
import { PlusIcon } from '../../../shared/ui/icons'
import { BanListSkeleton } from '../../../shared/ui/skeleton/layouts'
import { expressionCountText, isExpressionFull, type ExpressionKind } from '../lib/expressionRules'
import type { ExpressionTexts } from '../lib/expressionTexts'
import type { LoadStatus } from '../lib/loadStatus'

/** A explicação, a contagem "N de limite" e o botão de adicionar (para quem pode). */
export function ExpressionToolbar({
  kind,
  texts,
  count,
  canAdd,
  onAdd
}: {
  kind: ExpressionKind
  texts: ExpressionTexts
  count: number
  canAdd: boolean
  onAdd: () => void
}): React.JSX.Element {
  const full = isExpressionFull(kind, count)
  return (
    <div className="flex flex-col gap-3">
      <p className="text-ds-sm text-secondary">{texts.description}</p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-ds-xs font-medium text-muted">
          {expressionCountText(kind, count)}
        </span>
        {canAdd && (
          <Button
            icon={PlusIcon}
            size="sm"
            className="self-start sm:self-auto"
            disabled={full}
            onClick={onAdd}
          >
            {texts.add}
          </Button>
        )}
      </div>
      {canAdd && full && (
        <p className="text-ds-xs text-muted">Limite atingido: apague um para adicionar outro.</p>
      )}
    </div>
  )
}

/** A lista, ou o carregando, o erro (com tentar de novo) ou o vazio. */
export function ExpressionListBody({
  status,
  texts,
  empty,
  onRetry,
  children
}: {
  status: LoadStatus
  texts: ExpressionTexts
  empty: boolean
  onRetry: () => void
  children: ReactNode
}): React.JSX.Element {
  if (status === 'loading' && empty) return <BanListSkeleton />
  if (status === 'error' && empty) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-2 text-ds-sm text-muted">
        <span>{texts.loadError}</span>
        <Button variant="ghost" size="sm" onClick={onRetry}>
          Tentar de novo
        </Button>
      </div>
    )
  }
  if (empty) return <p className="text-ds-sm text-muted">{texts.empty}</p>
  return <ul className="divide-y divide-subtle rounded-lg border border-subtle">{children}</ul>
}
