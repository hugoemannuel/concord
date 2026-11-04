import { useEmojiView } from '../hooks/useEmojiView'
import { useEmojiSrc } from '../hooks/useEmojiSrc'

export type CustomEmojiSize = 'inline' | 'jumbo' | 'reaction' | 'picker'

const SIZE_CLASS: Record<CustomEmojiSize, string> = {
  inline: 'h-[1.375em] w-[1.375em] align-[-0.3em]',
  jumbo: 'h-12 w-12',
  reaction: 'h-5 w-5',
  picker: 'h-7 w-7'
}

const SIZE_PX: Record<CustomEmojiSize, number> = { inline: 22, jumbo: 48, reaction: 20, picker: 28 }

/**
 * Emoji personalizado. Aparece para quem é membro do servidor dele e para quem
 * recebeu depois de ele ser usado fora do servidor; apagado (ou sem acesso) fica
 * o ":nome:". Antes de saber, guarda o espaço do emoji para a linha não pular.
 */
export default function CustomEmoji({
  id,
  name,
  size = 'inline'
}: {
  id: string
  name: string
  size?: CustomEmojiSize
}): React.JSX.Element {
  const { visible, settled } = useEmojiView(id)
  const { src, onError } = useEmojiSrc(id, visible)
  const label = `:${name}:`
  if (settled && !visible) return <>{label}</>
  if (!visible || !src) {
    return <span role="img" aria-label={label} className={`inline-block ${SIZE_CLASS[size]}`} />
  }
  return (
    <img
      src={src}
      alt={label}
      title={label}
      width={SIZE_PX[size]}
      height={SIZE_PX[size]}
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={onError}
      className={`inline-block object-contain ${SIZE_CLASS[size]}`}
    />
  )
}
