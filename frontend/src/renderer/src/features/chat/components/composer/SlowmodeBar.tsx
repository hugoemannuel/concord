import { ClockIcon } from '../../../../shared/ui/icons'

/** Faixa do modo lento acima do campo de mensagem (texto de lib/slowmode). */
function SlowmodeBar({ text }: { text: string | null }): React.JSX.Element | null {
  if (!text) return null
  return (
    // Sem aria-live: a contagem muda a cada segundo; a recusa do servidor já
    // sai em aviso (toast).
    <p className="mb-1 flex min-w-0 items-center gap-1.5 px-1 text-ds-sm text-muted">
      <ClockIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="truncate tabular-nums">{text}</span>
    </p>
  )
}

export default SlowmodeBar
