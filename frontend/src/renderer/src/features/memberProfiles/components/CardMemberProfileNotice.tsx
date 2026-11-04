import type { CardMemberProfile } from '../hooks/useCardMemberProfile'

/** No cartão: avisa que há perfil neste servidor e alterna com o perfil global. */
export default function CardMemberProfileNotice({
  card
}: {
  card: CardMemberProfile & { toggle: () => void }
}): React.JSX.Element | null {
  if (!card.available) return null
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg bg-input px-3 py-1.5">
      <span className="text-ds-xs text-secondary">
        {card.showingGlobal ? 'Perfil global' : 'Perfil neste servidor'}
      </span>
      <button
        type="button"
        onClick={card.toggle}
        className="focus-ring min-h-10 cursor-pointer rounded-md text-ds-xs font-medium text-link hover:underline"
      >
        {card.showingGlobal ? 'Ver perfil do servidor' : 'Ver perfil global'}
      </button>
    </div>
  )
}
