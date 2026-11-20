import SuggestionList from '../../../shared/ui/SuggestionList'
import { serverDisplayName } from '../../servers/lib/serverNames'
import type { MentionSuggestion } from '../lib/mentions'

/** Quem marcar com @, em cima do campo. Mouse e setas mudam o destaque. */
export default function MentionSuggestionList({
  listId,
  suggestions,
  highlight,
  onPick,
  onHighlight
}: {
  listId: string
  suggestions: MentionSuggestion[]
  highlight: number
  onPick: (username: string) => void
  onHighlight: (index: number) => void
}): React.JSX.Element {
  return (
    <SuggestionList
      id={listId}
      label="Marcar alguém"
      items={suggestions}
      highlight={highlight}
      itemKey={(m) => `${m.kind}:${m.username}`}
      onPick={(m) => onPick(m.username)}
      onHighlight={onHighlight}
      className="absolute bottom-full left-4 right-4 mb-2"
    >
      {(m) => <MentionLabel suggestion={m} />}
    </SuggestionList>
  )
}

/** @everyone/@here com a explicação; pessoa com o nome de exibição e o @. */
function MentionLabel({ suggestion: m }: { suggestion: MentionSuggestion }): React.JSX.Element {
  return m.kind === 'everyone' ? (
    <>
      <span className="font-semibold">@{m.username}</span>
      <span className="text-ds-xs text-muted">{m.description}</span>
    </>
  ) : (
    <>
      <span className="font-semibold">{serverDisplayName(m, m)}</span>
      <span className="text-ds-xs text-muted">@{m.username}</span>
    </>
  )
}
