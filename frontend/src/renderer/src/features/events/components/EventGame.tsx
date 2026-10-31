import GameIcon from '../../activity/components/GameIcon'

/** O jogo do evento, com o logo; não renderiza nada quando o evento não tem jogo. */
export default function EventGame({
  name,
  className = ''
}: {
  name: string | null
  className?: string
}): React.JSX.Element | null {
  if (!name) return null
  return (
    <span className={`flex min-w-0 items-center gap-1.5 text-ds-sm text-normal ${className}`}>
      <GameIcon name={name} className="h-4 w-4 shrink-0" />
      <span className="sr-only">Jogo: </span>
      <span className="min-w-0 truncate">{name}</span>
    </span>
  )
}
