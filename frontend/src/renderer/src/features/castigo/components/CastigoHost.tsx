import { useCastigoVote } from '../hooks/useCastigoVote'
import { useMyCastigo, useServerCastigosLoad } from '../hooks/useMyCastigo'
import CastigoModal from './CastigoModal'
import CastigoSelfNotice from './CastigoSelfNotice'
import CastigoVoteCard from './CastigoVoteCard'

/** O castigo no app: o modal, a votação da call e o aviso de quem está de castigo. */
function CastigoHost(): React.JSX.Element {
  useServerCastigosLoad()
  const mine = useMyCastigo()
  const voteState = useCastigoVote()
  const { vote } = voteState

  return (
    <>
      <CastigoModal />
      {(mine || vote) && (
        <div className="pointer-events-none fixed inset-x-4 top-14 z-50 flex flex-col gap-2 sm:left-auto sm:right-6 sm:w-full sm:max-w-sm">
          {mine && <CastigoSelfNotice effects={mine.effects} endsAt={mine.endsAt} />}
          {vote && <CastigoVoteCard state={{ ...voteState, vote }} />}
        </div>
      )}
    </>
  )
}

export default CastigoHost
