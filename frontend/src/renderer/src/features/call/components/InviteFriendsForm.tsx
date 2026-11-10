import { useEffect, useRef, useState } from 'react'
import Button from '../../../shared/ui/Button'
import { useCallInviteStore, type SendPhase } from '../store/callInviteStore'
import { INVITE_COPY } from '../lib/callInviteCopy'
import { useInviteCandidates } from '../hooks/useInviteCandidates'
import FriendPickList from './FriendPickList'

function sendLabel(phase: SendPhase): string {
  if (phase === 'loading') return INVITE_COPY.sending
  return phase === 'error' ? INVITE_COPY.retry : INVITE_COPY.send
}

/** Busca + multisseleção de amigos e membros do servidor; todos os convites numa ação. */
function InviteFriendsForm({ callId }: { callId: string }): React.JSX.Element {
  const phase = useCallInviteStore((s) => s.phase)
  const error = useCallInviteStore((s) => s.error)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const { loaded, sections, total, available } = useInviteCandidates(query)
  const sending = phase === 'loading'
  const searchRef = useRef<HTMLInputElement>(null)
  // Foco na busca ao abrir (a janela monta o formulário só quando abre).
  useEffect(() => searchRef.current?.focus(), [])

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={searchRef}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label={INVITE_COPY.searchLabel}
        placeholder={INVITE_COPY.searchPlaceholder}
        autoComplete="off"
        spellCheck={false}
        className="min-h-10 w-full rounded-lg border border-subtle bg-fg/5 px-3 text-ds-sm text-strong placeholder:text-faint focus-ring"
      />
      <FriendPickList
        loaded={loaded}
        sections={sections}
        total={total}
        available={available}
        selected={selected}
        disabled={sending}
        onChange={setSelected}
      />
      {phase === 'error' && (
        <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-ds-sm text-danger">
          {error ?? INVITE_COPY.requestFailed}
        </p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-ds-xs text-muted" aria-live="polite">
          {INVITE_COPY.selectedCount(selected.length)}
        </span>
        <Button
          className="min-h-10"
          disabled={selected.length === 0 || sending}
          onClick={() => void useCallInviteStore.getState().send(callId, selected)}
        >
          {sendLabel(phase)}
        </Button>
      </div>
    </div>
  )
}

export default InviteFriendsForm
