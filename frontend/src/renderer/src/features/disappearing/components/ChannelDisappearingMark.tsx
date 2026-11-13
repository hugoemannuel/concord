import { ClockIcon } from '../../../shared/ui/icons'
import { bannerText, shortLabel, type DisappearingSeconds } from '../lib/disappearing'

/**
 * Relógio só de leitura no cabeçalho do canal: mostra o prazo curto das
 * mensagens temporárias (quem muda o prazo é o Editar canal).
 */
function ChannelDisappearingMark({
  seconds
}: {
  seconds: DisappearingSeconds | null | undefined
}): React.JSX.Element | null {
  if (seconds == null) return null
  const text = bannerText(seconds)
  return (
    <span
      role="img"
      aria-label={text}
      title={text}
      className="flex shrink-0 items-center gap-1 text-brand"
    >
      <ClockIcon size={16} aria-hidden />
      <span className="whitespace-nowrap text-ds-xs font-medium">{shortLabel(seconds)}</span>
    </span>
  )
}

export default ChannelDisappearingMark
