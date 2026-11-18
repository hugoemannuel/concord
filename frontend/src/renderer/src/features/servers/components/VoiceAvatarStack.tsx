import Avatar from '../../../shared/ui/Avatar'
import type { VoiceMember } from '../../call/lib/voiceServer'
import { summarizeVoicePeople } from '../lib/serverHoverCard'

/**
 * Avatares sobrepostos de quem está na call (até 5) e "+N" para o resto.
 * `ringClass` é a cor do anel, a mesma do fundo onde a pilha fica.
 */
export function VoiceAvatarStack({
  people,
  ringClass
}: {
  people: VoiceMember[]
  ringClass: string
}): React.JSX.Element | null {
  const { visible, extra } = summarizeVoicePeople(people)
  if (visible.length === 0) return null
  return (
    <span className="flex items-center -space-x-1.5">
      {visible.map((person) => (
        <Avatar
          key={person.id}
          userId={person.id}
          name={person.name}
          avatarUrl={person.avatarUrl}
          size={24}
          animate="always"
          className={`rounded-full ring-2 ${ringClass}`}
        />
      ))}
      {extra > 0 && (
        <span
          className={`z-10 flex h-6 min-w-6 items-center justify-center rounded-full bg-fg/20 px-1 text-ds-xxs font-bold text-strong ring-2 ${ringClass}`}
        >
          +{extra}
        </span>
      )}
    </span>
  )
}
