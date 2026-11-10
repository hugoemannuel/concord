import { useEffect, useState } from 'react'
import { useAuthStore } from '../../auth/store/authStore'
import { useCallStore } from '../../call/store/callStore'
import { showToast } from '../../../shared/store/toastStore'
import { voteMsLeft, voteView, type BallotState, type CastigoVote } from '../lib/castigo'
import { CASTIGO_COPY, castigoErrorMessage } from '../lib/castigoCopy'
import { useCastigoStore } from '../store/castigoStore'

/** Quanto tempo o resultado da votação fica na tela. */
const RESULT_MS = 4_000

export interface CastigoVoteState {
  vote: CastigoVote | null
  ballot: BallotState
  isTarget: boolean
  busy: boolean
  cast: (yes: boolean) => Promise<void>
}

/** A votação de castigo da call em que estou (relida ao entrar, some depois do resultado). */
export function useCastigoVote(): CastigoVoteState {
  const callId = useCallStore((s) =>
    s.status === 'active' && s.type === 'channel' ? s.callId : null
  )
  const vote = useCastigoStore((s) => (callId ? (s.votes[callId] ?? null) : null))
  const meId = useAuthStore((s) => s.user?.id)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (callId)
      void useCastigoStore
        .getState()
        .loadVote(callId)
        .catch(() => {})
  }, [callId])

  const view = voteView(vote, meId)
  const closed = view.closed
  useEffect(() => {
    if (!closed || !vote) return
    const t = window.setTimeout(() => useCastigoStore.getState().dropVote(vote.call_id), RESULT_MS)
    return () => window.clearTimeout(t)
  }, [closed, vote])

  // Aberta além do prazo (o aviso de fim não veio, o servidor reiniciou): sai.
  useEffect(() => {
    if (!vote || closed) return
    const t = window.setTimeout(
      () => useCastigoStore.getState().dropVote(vote.call_id),
      voteMsLeft(vote, Date.now()) + RESULT_MS
    )
    return () => window.clearTimeout(t)
  }, [closed, vote])

  const cast = async (yes: boolean): Promise<void> => {
    if (!vote) return
    setBusy(true)
    try {
      await useCastigoStore.getState().cast(vote, yes)
    } catch (err) {
      showToast.error(castigoErrorMessage(err, CASTIGO_COPY.ballotFailed))
    } finally {
      setBusy(false)
    }
  }

  return { vote, ballot: view.ballot, isTarget: view.isTarget, busy, cast }
}
