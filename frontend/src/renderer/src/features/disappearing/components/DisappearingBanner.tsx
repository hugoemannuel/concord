import { ClockIcon } from '../../../shared/ui/icons'
import { bannerText, type DisappearingSeconds } from '../lib/disappearing'

/** Faixa acima do campo de mensagem quando a conversa tem o modo temporário ligado. */
function DisappearingBanner({
  seconds
}: {
  seconds: DisappearingSeconds | null
}): React.JSX.Element | null {
  if (seconds === null) return null
  return (
    <p className="mb-1 flex min-w-0 items-center gap-1.5 px-1 text-ds-sm text-muted">
      <ClockIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="truncate">{bannerText(seconds)}</span>
    </p>
  )
}

export default DisappearingBanner
