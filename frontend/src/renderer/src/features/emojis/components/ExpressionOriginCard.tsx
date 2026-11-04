import { useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useAnchoredPickerPlacement } from '../../chat/hooks/useAnchoredPickerPlacement'
import { useEmotePickerDismiss } from '../../chat/hooks/useEmotePickerDismiss'
import type { ExpressionOrigin } from '../api/expressions'
import { useExpressionOrigin } from '../hooks/useExpressionOrigin'
import type { OriginKind } from '../store/expressionOrigins'
import ServerBadge from './ServerBadge'

/** O texto de origem. Servidor privado, para quem não é membro, não tem nome. */
export function originText(origin: ExpressionOrigin | undefined): string {
  if (origin?.private) return 'de um servidor privado'
  return origin?.server_name ? `de ${origin.server_name}` : 'de outro servidor'
}

/** Ao clicar num emoji ou figurinha da mensagem: o que é e de que servidor veio. */
export default function ExpressionOriginCard({
  kind,
  id,
  name,
  media,
  anchor,
  onClose
}: {
  kind: OriginKind
  id: string
  name: string
  media: ReactNode
  anchor: HTMLElement
  onClose: () => void
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const style = useAnchoredPickerPlacement(ref, anchor)
  useEmotePickerDismiss(ref, anchor, true, onClose)
  const entry = useExpressionOrigin(kind, id, true)
  const origin = entry?.origin
  const text = entry === undefined ? 'Carregando…' : originText(origin)

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={`:${name}:`}
      style={style}
      onClick={(e) => e.stopPropagation()}
      className="fixed z-50 flex max-w-[min(20rem,calc(100vw-1rem))] items-center gap-2 rounded-lg border border-subtle bg-floating p-2.5 shadow-2xl"
    >
      <span className="flex size-10 shrink-0 items-center justify-center">{media}</span>
      <div className="min-w-0">
        <p className="truncate text-ds-sm font-semibold text-strong">:{name}:</p>
        <p className="flex min-w-0 items-center gap-1 text-ds-xs text-muted">
          {origin?.server_name && <ServerBadge name={origin.server_name} iconUrl={origin.server_icon_url} size="xs" />}
          <span className="min-w-0 truncate">{text}</span>
        </p>
      </div>
    </div>,
    document.body
  )
}
