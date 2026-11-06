import { useEffect, useMemo, useState } from 'react'
import { pickSearchResult } from '../api/music'
import { formatDuration, MAESTRO_NAME, T14_DISMISS, T14_LABEL, T16_TITLE } from '../lib/music'
import { runSearchPick } from '../lib/searchPick'
import { useMusicStore, type MusicEphemeral } from '../store/musicStore'
import { showToast } from '../../../shared/store/toastStore'
import { EyeIcon, SearchIcon } from '../../../shared/ui/icons'
import MaestroAvatar from './MaestroAvatar'
import { MaestroText } from './MusicMessage'

function SearchPicker({ e, serverId }: { e: MusicEphemeral; serverId: string }): React.JSX.Element {
  const markExpired = useMusicStore((s) => s.markExpired)
  const dismiss = useMusicStore((s) => s.dismiss)
  const search = e.search!
  const [busy, setBusy] = useState(false)

  // Expira sozinho em 60 s: as opções ficam cinzas (T16b).
  useEffect(() => {
    if (e.expired) return
    const ms = search.expires_at - Date.now()
    if (ms <= 0) {
      markExpired(e.id)
      return
    }
    const timer = setTimeout(() => markExpired(e.id), ms)
    return () => clearTimeout(timer)
  }, [e.id, e.expired, search.expires_at, markExpired])

  const pick = async (index: number): Promise<void> => {
    setBusy(true)
    try {
      await runSearchPick({
        pick: () => pickSearchResult(serverId, search.token, index),
        dismiss: () => dismiss(e.id),
        markExpired: () => markExpired(e.id),
        error: showToast.error
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-1">
      <p className="flex items-start gap-1.5 text-ds-sm text-strong">
        <SearchIcon size={16} className="mt-0.5 shrink-0 text-muted" />
        {T16_TITLE(search.query)}
      </p>
      <div className="mt-2 flex flex-col gap-1">
        {search.results.map((r, i) => (
          <button
            key={r.video_id}
            type="button"
            disabled={e.expired || busy}
            onClick={() => void pick(i)}
            className="flex cursor-pointer items-center gap-3 rounded-md border border-subtle bg-fg/5 p-1.5 text-left transition-colors hover:bg-fg/10 disabled:cursor-default disabled:opacity-40"
          >
            {r.thumbnail && (
              <img src={r.thumbnail} alt="" className="h-9 w-16 rounded object-cover" />
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-ds-sm font-medium text-strong">{r.title}</span>
              <span className="block truncate text-ds-xs text-muted">
                {r.artist} · {formatDuration(r.duration_ms)}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

/** Respostas do Maestro que só eu vejo (não ficam salvas). */
function MusicEphemeralList({
  room,
  serverId
}: {
  room: string
  serverId: string | null
}): React.JSX.Element | null {
  const all = useMusicStore((s) => s.ephemeral)
  const items = useMemo(() => all.filter((e) => e.room === room), [all, room])
  const dismiss = useMusicStore((s) => s.dismiss)
  if (items.length === 0) return null
  return (
    <>
      {items.map((e) => (
        <div
          key={e.id}
          className="mx-2 my-1 flex gap-3 rounded-lg border border-subtle bg-fg/[0.03] px-3 py-2.5"
        >
          <MaestroAvatar />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-ds-sm font-semibold text-brand">{MAESTRO_NAME}</span>
              <span className="inline-flex flex-wrap items-center gap-x-1 text-ds-xxs text-faint">
                <EyeIcon size={12} />
                {T14_LABEL} ·
                <button
                  type="button"
                  onClick={() => dismiss(e.id)}
                  className="cursor-pointer text-link hover:underline"
                >
                  {T14_DISMISS}
                </button>
              </span>
            </div>
            {e.kind === 'text' && (
              <p className="whitespace-pre-wrap break-words text-ds-sm leading-relaxed text-strong">
                <MaestroText text={e.text ?? ''} />
              </p>
            )}
            {e.kind === 'search' && serverId && <SearchPicker e={e} serverId={serverId} />}
          </div>
        </div>
      ))}
    </>
  )
}

export default MusicEphemeralList
