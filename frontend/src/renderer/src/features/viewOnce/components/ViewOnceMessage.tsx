import { useState } from 'react'
import { useAuthStore } from '../../auth/store/authStore'
import type { Message } from '../../chat/api/messages'
import { outcomeState, pillState, type PillState } from '../lib/viewOnce'
import ViewOncePill from './ViewOncePill'
import ViewOnceViewer, { type ViewerOutcome } from './ViewOnceViewer'

const myId = (s: { user?: { id: string } | null }): string => s.user?.id ?? ''

/** A mídia de visualização única na mensagem: a pílula e, ao tocar, o visualizador. */
function ViewOnceMessage({ message }: { message: Message }): React.JSX.Element | null {
  const meId = useAuthStore(myId)
  const [viewing, setViewing] = useState(false)
  // Até o servidor confirmar (message:update), mostra o resultado da abertura daqui.
  const [local, setLocal] = useState<PillState | null>(null)
  const media = message.view_once
  if (!media) return null
  const state = local ?? pillState(media, message.author_id, meId)

  const done = (outcome: ViewerOutcome): void => {
    setViewing(false)
    const next = outcomeState(outcome)
    if (next) setLocal(next)
  }

  return (
    <>
      <ViewOncePill state={state} media={media} onOpen={() => setViewing(true)} />
      {viewing && <ViewOnceViewer media={media} onDone={done} />}
    </>
  )
}

export default ViewOnceMessage
