import { useNow } from '../../../shared/hooks/useNow'
import { useState } from 'react'
import type { Poll } from '../api/messages'
import { isPollClosed, pollHint, pollPercent, pollTimeLeft, pollWinners, votesLabel } from '../lib/polls'
import { showToast } from '../../../shared/store/toastStore'
import { PollIcon } from '../../../shared/ui/icons'
import PollActions from './PollActions'
import PollAnswerRow from './PollAnswerRow'

interface PollCardProps {
  poll: Poll
  isAuthor: boolean
  onVote: (answerIds: number[]) => Promise<void>
  onEnd: () => Promise<void>
}

function PollCard({ poll, isAuthor, onVote, onEnd }: PollCardProps): React.JSX.Element {
  const now = useNow()
  const closed = isPollClosed(poll, now)
  const hasVoted = poll.answers.some((a) => a.me_voted)
  const [selected, setSelected] = useState<number[]>([])
  const [peek, setPeek] = useState(false)
  const [busy, setBusy] = useState(false)
  const showResults = closed || hasVoted || peek
  const winners = closed ? pollWinners(poll) : []

  const toggle = (answerId: number): void => {
    if (showResults) return
    setSelected((current) => {
      if (!poll.allow_multiselect) return current[0] === answerId ? [] : [answerId]
      return current.includes(answerId)
        ? current.filter((id) => id !== answerId)
        : [...current, answerId]
    })
  }

  const run = async (action: () => Promise<void>, fallback: string): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      await action()
    } catch (err) {
      showToast.error(err instanceof Error ? err.message : fallback)
    } finally {
      setBusy(false)
    }
  }

  const handleVote = (): Promise<void> =>
    run(async () => {
      await onVote(selected)
      setSelected([])
      setPeek(false)
    }, 'Falha ao votar.')

  return (
    <div className="mt-1 w-full max-w-md rounded-xl border border-subtle bg-input p-4">
      <p className="break-words text-ds-md font-semibold text-strong">{poll.question}</p>
      <p className="mb-3 mt-0.5 text-ds-xs text-muted">
        {pollHint(closed, poll.allow_multiselect)}
      </p>

      <div className="flex flex-col gap-2" role={showResults ? 'list' : 'group'}>
        {poll.answers.map((answer) => (
          <PollAnswerRow
            key={answer.answer_id}
            answer={answer}
            percent={pollPercent(answer.count, poll.total_voters)}
            isSelected={selected.includes(answer.answer_id)}
            isWinner={winners.includes(answer.answer_id)}
            showResults={showResults}
            multiselect={poll.allow_multiselect}
            disabled={showResults || busy}
            onToggle={() => toggle(answer.answer_id)}
          />
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex items-center gap-1.5 text-ds-xs text-muted">
          <PollIcon className="h-3.5 w-3.5" />
          {votesLabel(poll.total_voters)} · {pollTimeLeft(poll, now)}
        </span>
        <PollActions
          closed={closed}
          hasVoted={hasVoted}
          isAuthor={isAuthor}
          peek={peek}
          showResults={showResults}
          busy={busy}
          canVote={selected.length > 0}
          onTogglePeek={() => setPeek((v) => !v)}
          onRemoveVote={() => void run(() => onVote([]), 'Falha ao remover o voto.')}
          onEnd={() => void run(onEnd, 'Falha ao encerrar a enquete.')}
          onVote={() => void handleVote()}
        />
      </div>
    </div>
  )
}

export default PollCard
