import SuggestionList from '../../../shared/ui/SuggestionList'
import type { SlashSuggestion } from '../lib/music'

/** Lista dos comandos (Maestro, /tts) ao digitar "/" no chat. Mouse e setas mudam o destaque. */
function SlashSuggestions({
  listId,
  items,
  highlight,
  onPick,
  onHighlight
}: {
  listId: string
  items: SlashSuggestion[]
  highlight: number
  onPick: (command: SlashSuggestion) => void
  onHighlight: (index: number) => void
}): React.JSX.Element {
  return (
    <SuggestionList
      id={listId}
      label="Comandos"
      items={items}
      highlight={highlight}
      itemKey={(s) => s.command}
      onPick={onPick}
      onHighlight={onHighlight}
      className="absolute bottom-full left-0 right-0 mb-2"
      itemClassName="items-baseline"
    >
      {(s) => (
        <>
          <span className="shrink-0 whitespace-nowrap font-semibold text-strong">{s.usage}</span>
          <span className="min-w-0 truncate text-ds-xs text-faint">
            {s.description ?? s.aliases.join(' · ')}
          </span>
        </>
      )}
    </SuggestionList>
  )
}

export default SlashSuggestions
