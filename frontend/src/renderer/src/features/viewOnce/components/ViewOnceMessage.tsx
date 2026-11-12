import { useRef, useState } from 'react'
import { useAuthStore } from '../../auth/store/authStore'
import type { Message } from '../../chat/api/messages'
import { mediaKey, outcomeState, shownPillState, type LocalPill } from '../lib/viewOnce'
import ViewOncePill from './ViewOncePill'
import ViewOnceViewer, { type ViewerOutcome } from './ViewOnceViewer'

const myId = (s: { user?: { id: string } | null }): string => s.user?.id ?? ''

/** A mídia de visualização única na mensagem: a pílula e, ao tocar, o visualizador. */
function ViewOnceMessage({ message }: { message: Message }): React.JSX.Element | null {
  const meId = useAuthStore(myId)
  const [viewing, setViewing] = useState(false)
  const pillRef = useRef<HTMLElement>(null)
  // Até o servidor mandar outra versão da mídia (message:update), mostra o
  // resultado da abertura daqui.
  const [local, setLocal] = useState<LocalPill | null>(null)
  const media = message.view_once
  if (!media) return null
  const state = shownPillState(local, media, message.author_id, meId)

  const done = (outcome: ViewerOutcome): void => {
    setViewing(false)
    // Foco de volta à pílula (o palco ocupava a tela).
    pillRef.current?.focus()
    const next = outcomeState(outcome)
    if (next) setLocal({ state: next, key: mediaKey(media) })
  }

  return (
    <>
      <ViewOncePill ref={pillRef} state={state} media={media} onOpen={() => setViewing(true)} />
      {viewing && <ViewOnceViewer media={media} onDone={done} />}
    </>
  )
}

export default ViewOnceMessage
