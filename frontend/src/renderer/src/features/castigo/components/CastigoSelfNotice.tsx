import { ClockIcon } from '../../../shared/ui/icons'
import type { CastigoEffects } from '../lib/castigo'
import { CASTIGO_COPY, clockTime, effectsSummary } from '../lib/castigoCopy'

/** "Você está de castigo": o que vale e quando acaba. */
function CastigoSelfNotice({
  effects,
  endsAt
}: {
  effects: CastigoEffects
  endsAt: number
}): React.JSX.Element {
  return (
    <div
      role="status"
      className="pointer-events-auto flex items-center gap-2.5 rounded-lg border border-danger/30 bg-floating p-3 shadow-2xl"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-danger/15 text-danger">
        <ClockIcon size={16} />
      </span>
      <div className="min-w-0">
        <p className="text-ds-sm font-semibold text-strong">{CASTIGO_COPY.selfTitle}</p>
        <p className="text-ds-xs text-secondary">
          {effectsSummary(effects)} · {CASTIGO_COPY.endsAt(clockTime(endsAt))}
        </p>
      </div>
    </div>
  )
}

export default CastigoSelfNotice
