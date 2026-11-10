import type { ReactNode } from 'react'
import type { ForwardedFrom } from '../../api/messages'
import { forwardOrigin } from '../../lib/forward'
import { formatMessageDateTime } from '../../lib/messageDateTime'
import { ForwardIcon } from '../../../../shared/ui/icons'

/** "Encaminhada · de Ana · #geral · Salinha" acima do conteúdo da encaminhada. */
export function ForwardedLabel({ from }: { from: ForwardedFrom }): React.JSX.Element {
  const origin = forwardOrigin(from)
  return (
    <div
      className="flex min-w-0 items-center gap-1 text-ds-xs text-muted"
      title={from.created_at ? `Enviada em ${formatMessageDateTime(from.created_at)}` : undefined}
    >
      <ForwardIcon size={12} className="shrink-0" />
      <span className="shrink-0 font-medium italic">Encaminhada</span>
      <span className="min-w-0 truncate">
        de {origin.author} · {origin.place}
      </span>
    </div>
  )
}

/** Conteúdo da encaminhada com a barra à esquerda e a origem; mensagem comum passa direto. */
export default function ForwardedFrame({
  from,
  children
}: {
  from?: ForwardedFrom | null
  children: ReactNode
}): React.JSX.Element {
  if (!from) return <>{children}</>
  return (
    <div className="mt-0.5 flex min-w-0 flex-col gap-0.5 border-l-2 border-normal pl-3">
      <ForwardedLabel from={from} />
      {children}
    </div>
  )
}
