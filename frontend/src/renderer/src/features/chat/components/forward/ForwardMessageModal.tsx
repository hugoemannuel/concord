import { useMemo, useState } from 'react'
import Button from '../../../../shared/ui/Button'
import Input from '../../../../shared/ui/Input'
import Modal from '../../../../shared/ui/Modal'
import { ForwardIcon } from '../../../../shared/ui/icons'
import type { Message } from '../../api/messages'
import { useForwardMessage } from '../../hooks/useForwardMessage'
import { filterDestinations, type ForwardDestination } from '../../lib/forward'
import { messagePreviewParts } from '../../lib/polls'
import { useForwardStore } from '../../store/forwardStore'
import PreviewText from '../PreviewText'
import ForwardDestinationList from './ForwardDestinationList'

const COMMENT_MAX = 4000

/** A mensagem que vai ser encaminhada, numa linha: quem escreveu e a prévia. */
export function ForwardPreview({ message }: { message: Message }): React.JSX.Element {
  const author = message.author?.display_name || message.author?.username || 'Alguém'
  return (
    <div className="min-w-0 rounded-lg border-l-2 border-normal bg-fg/5 px-3 py-2 text-ds-sm">
      <p className="truncate font-medium text-strong">{author}</p>
      <PreviewText preview={messagePreviewParts(message)} className="text-secondary" />
    </div>
  )
}

function ForwardDialog({ message, onClose }: { message: Message; onClose: () => void }): React.JSX.Element {
  const forward = useForwardMessage(message)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<ForwardDestination | null>(null)
  const [comment, setComment] = useState('')
  const visible = useMemo(() => filterDestinations(forward.destinations, query), [forward.destinations, query])

  const submit = async (): Promise<void> => {
    if (selected && (await forward.send(selected, comment))) onClose()
  }

  return (
    <Modal open title="Encaminhar mensagem" onClose={onClose}>
      <div className="flex min-w-0 flex-col gap-3">
        <ForwardPreview message={message} />
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar canal ou conversa"
          aria-label="Buscar canal ou conversa"
        />
        <ForwardDestinationList
          items={visible}
          selectedKey={selected?.key}
          loading={forward.loadingChannels}
          onSelect={setSelected}
        />
        <Input
          value={comment}
          maxLength={COMMENT_MAX}
          onChange={(e) => setComment(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void submit()}
          placeholder="Adicionar um comentário (opcional)"
          aria-label="Comentário"
        />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button icon={ForwardIcon} disabled={!selected} loading={forward.sending} onClick={() => void submit()}>
            Encaminhar
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/** Seletor de destino do "Encaminhar" (aberto pelo menu da mensagem, um por vez no app). */
export default function ForwardMessageModal(): React.JSX.Element | null {
  const message = useForwardStore((s) => s.message)
  const close = useForwardStore((s) => s.close)
  if (!message) return null
  return <ForwardDialog key={message.id} message={message} onClose={close} />
}
