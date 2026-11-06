import { useState } from 'react'
import { removeQueueItem, swapQueueItems, type MusicItem } from '../api/music'
import { canSwap, formatDuration, QUEUE_PREVIEW, T17, T20 } from '../lib/music'
import { visibleQueue } from '../lib/musicPanel'
import { errorMessage } from '../../../shared/lib/errorMessage'
import { showToast } from '../../../shared/store/toastStore'
import CloseButton from '../../../shared/ui/CloseButton'

const failed = (err: unknown): void => {
  showToast.error(errorMessage(err, 'Falha na operação.'))
}

interface QueueItemProps {
  serverId: string
  item: MusicItem
  position: number
  mine: boolean
  /** A música sendo arrastada pode trocar de lugar com esta? */
  canDropHere: () => boolean
  onDragStart: () => void
  onDrop: () => void
}

function MusicQueueItem({
  serverId,
  item,
  position,
  mine,
  canDropHere,
  onDragStart,
  onDrop
}: QueueItemProps): React.JSX.Element {
  return (
    <li
      draggable={mine}
      onDragStart={onDragStart}
      onDragOver={(e) => {
        if (canDropHere()) e.preventDefault()
      }}
      onDrop={onDrop}
      className={`flex items-center gap-2 rounded px-2 py-1 text-sm ${mine ? 'cursor-grab bg-fg/5' : 'opacity-80'}`}
    >
      <span className="w-4 text-xs text-gray-500">{position}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-strong">{item.title}</span>
        <span className="block truncate text-[11px] text-gray-500">
          {formatDuration(item.duration_ms)} · @{item.requested_by.username}
        </span>
      </span>
      {mine && (
        <CloseButton size="sm" label="Remover" onClick={() => removeQueueItem(serverId, item.id).catch(failed)} />
      )}
    </li>
  )
}

/** "Próximas": a fila, com arrastar para trocar as minhas de lugar e "Ver mais". */
function MusicQueue({
  serverId,
  queue,
  meId
}: {
  serverId: string
  queue: MusicItem[]
  meId: string | undefined
}): React.JSX.Element {
  const [dragId, setDragId] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const dragged = (): MusicItem | undefined => queue.find((i) => i.id === dragId)

  const onDrop = (target: MusicItem): void => {
    const source = dragged()
    setDragId(null)
    if (!source || !canSwap(source, target, meId)) return
    swapQueueItems(serverId, source.id, target.id).catch(failed)
  }

  return (
    <>
      <h3 className="mt-2 text-xs font-bold uppercase tracking-wide text-gray-400">{T17.next}</h3>
      {queue.length === 0 ? (
        <p className="text-sm text-gray-500">{T17.empty}</p>
      ) : (
        <ol className="flex flex-col gap-1">
          {visibleQueue(queue, showAll).map((it, i) => (
            <MusicQueueItem
              key={it.id}
              serverId={serverId}
              item={it}
              position={i + 1}
              mine={it.requested_by.id === meId}
              canDropHere={() => {
                const source = dragged()
                return !!source && canSwap(source, it, meId)
              }}
              onDragStart={() => setDragId(it.id)}
              onDrop={() => onDrop(it)}
            />
          ))}
        </ol>
      )}
      {queue.length > QUEUE_PREVIEW && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          aria-expanded={showAll}
          className="cursor-pointer rounded-md bg-fg/10 px-3 py-1.5 text-xs font-semibold text-gray-200 transition-colors hover:bg-fg/15 hover:text-strong"
        >
          {showAll ? T20.seeLess : T20.seeMore(queue.length - QUEUE_PREVIEW)}
        </button>
      )}
    </>
  )
}

export default MusicQueue
