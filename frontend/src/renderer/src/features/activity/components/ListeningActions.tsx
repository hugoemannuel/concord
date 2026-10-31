import { useCallStore } from '../../call/store/callStore'
import { useDirectLinks } from '../hooks/useDirectLinks'
import { useQueueListening } from '../hooks/useQueueListening'
import { openListeningLink } from '../lib/directLinks'
import { listeningLinks, withDirectLinks, type ListeningLink } from '../lib/listeningLinks'
import type { ListeningActivity } from '../lib/listeningActivity'
import { queueButtonLabel } from '../lib/queueListening'
import { queueTarget } from '../lib/queueTarget'
import MusicIcon from './MusicIcon'
import { PlusIcon } from '../../../shared/ui/icons'

const itemClass =
  'focus-ring flex min-h-10 w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-left text-ds-sm text-normal transition-colors hover:bg-fg/10 disabled:cursor-not-allowed disabled:opacity-50'

const openExternal = (url: string): void => {
  window.open(url, '_blank', 'noopener,noreferrer')
}

/** Menu "Ouvir também" de uma faixa: abrir em outro serviço ou pôr na fila do Maestro da minha call. */
export function ListeningActions({
  listening,
  id
}: {
  listening: ListeningActivity
  id: string
}): React.JSX.Element {
  const status = useCallStore((s) => s.status)
  const type = useCallStore((s) => s.type)
  const serverId = useCallStore((s) => s.serverId)
  const target = queueTarget({ status, type, serverId })
  const reason = 'reason' in target ? target.reason : null
  const { direct, loading, whenReady } = useDirectLinks(listening)
  const { adding, add } = useQueueListening(target, listening)
  const search = listeningLinks(listening)
  // Ainda buscando a faixa: o clique espera o link direto (até 3 s) em vez de abrir a busca.
  const onLinkClick = (e: React.MouseEvent, link: ListeningLink): void => {
    if (!loading) return
    e.preventDefault()
    void openListeningLink(link.key, search, whenReady(), openExternal)
  }
  return (
    <div
      id={id}
      role="menu"
      aria-label="Ouvir também"
      aria-busy={loading}
      className="mt-2 flex flex-col gap-0.5"
    >
      {withDirectLinks(search, direct).map((link) => (
        <a
          key={link.key}
          role="menuitem"
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => onLinkClick(e, link)}
          className={itemClass}
        >
          <MusicIcon app={link.label} className="h-4 w-4" />
          Ouvir no {link.label}
        </a>
      ))}
      <button
        type="button"
        role="menuitem"
        disabled={reason !== null || adding}
        aria-busy={adding}
        aria-describedby={reason ? `${id}-motivo` : undefined}
        onClick={() => void add()}
        className={itemClass}
      >
        <PlusIcon size={16} className="shrink-0" />
        {queueButtonLabel(adding)}
      </button>
      {reason && (
        <p id={`${id}-motivo`} className="px-2.5 text-ds-xs text-muted">
          {reason}
        </p>
      )}
    </div>
  )
}
