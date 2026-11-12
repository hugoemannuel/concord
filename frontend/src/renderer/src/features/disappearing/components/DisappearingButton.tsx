import { useRef, useState } from 'react'
import { ClockIcon } from '../../../shared/ui/icons'
import IconButton from '../../../shared/ui/IconButton'
import { useDismiss } from '../../../shared/hooks/useDismiss'
import { useMediaQuery } from '../../../shared/hooks/useMediaQuery'
import { insideAny } from '../../../shared/lib/dismiss'
import { showToast } from '../../../shared/store/toastStore'
import { setDisappearing } from '../api/disappearing'
import { useDisappearing } from '../hooks/useDisappearing'
import { chooseDisappearing } from '../lib/chooseDisappearing'
import { shortLabel, type DisappearingSeconds } from '../lib/disappearing'
import DisappearingMenu from './DisappearingMenu'

const SHEET_QUERY = '(max-width: 639px)'
/**
 * Relógio do cabeçalho da conversa: abre as opções do prazo das mensagens
 * temporárias (popover; folha de baixo em telas estreitas). Ligado, mostra o
 * prazo curto ao lado do ícone.
 */
function DisappearingButton({
  conversationId
}: {
  conversationId: string | null | undefined
}): React.JSX.Element | null {
  const current = useDisappearing(conversationId)
  const [open, setOpen] = useState(false)
  const sheet = useMediaQuery(SHEET_QUERY)
  const wrapRef = useRef<HTMLDivElement>(null)

  useDismiss((t) => insideAny([wrapRef.current], t), () => setOpen(false), { enabled: open })

  if (!conversationId) return null

  const choose = (seconds: DisappearingSeconds | null): void => {
    setOpen(false)
    void chooseDisappearing(
      { set: setDisappearing, onError: showToast.error },
      conversationId,
      current,
      seconds
    )
  }

  return (
    <div ref={wrapRef} className="relative flex shrink-0 items-center">
      <IconButton
        icon={ClockIcon}
        label="Mensagens temporárias"
        variant={current === null ? 'ghost' : 'filled'}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={current === null ? '' : 'text-brand'}
      />
      {current !== null && (
        <span className="ml-1 text-ds-xs font-medium text-brand">{shortLabel(current)}</span>
      )}
      {open && (
        <>
          {sheet && <div aria-hidden="true" className="fixed inset-0 z-50 bg-black/50" />}
          <DisappearingMenu current={current} sheet={sheet} onChoose={choose} />
        </>
      )}
    </div>
  )
}

export default DisappearingButton
