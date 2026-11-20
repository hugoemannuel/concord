import SuggestionList from '../../../shared/ui/SuggestionList'
import { serverDisplayName } from '../../servers/lib/serverNames'
import { roleColorCss } from '../../servers/lib/permissions'
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
  onPick: (item: MentionSuggestion) => void
  onHighlight: (index: number) => void
}): React.JSX.Element {
  return (
    <SuggestionList
      id={listId}
      label="Marcar alguém"
      items={suggestions}
      highlight={highlight}
      itemKey={(m) => `${m.kind}:${m.username}`}
      onPick={onPick}
      onHighlight={onHighlight}
      className="absolute bottom-full left-4 right-4 mb-2"
    >
      {(m) => <MentionLabel suggestion={m} />}
    </SuggestionList>
  )
}

/**
 * @all/@here com a explicação; pessoa com o nome de exibição e o @; cargo com
 * a bolinha e o nome na cor dele e a etiqueta "Cargo", para não confundir com
 * uma pessoa de mesmo nome.
 */
function MentionLabel({ suggestion: m }: { suggestion: MentionSuggestion }): React.JSX.Element {
  if (m.kind === 'role') {
    const color = roleColorCss(m.color)
    return (
      <>
        <span
          aria-hidden
          className="h-3 w-3 shrink-0 rounded-full border border-normal"
          style={{ background: color ?? 'transparent' }}
        />
        <span className="min-w-0 truncate font-semibold" style={{ color }}>
          {m.name}
        </span>
        <span className="shrink-0 rounded bg-fg/10 px-1.5 text-ds-xs text-muted">Cargo</span>
      </>
    )
  }
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
