import Avatar from '../../../shared/ui/Avatar'
import { useInBackground } from '../../../shared/store/windowActivityStore'
import { useCallStore } from '../store/callStore'
import { callAvatarAnimate } from '../lib/callAvatarMotion'

/**
 * Avatar de quem está numa chamada (tile, lista do canal de voz, espectadores,
 * DM, chamada recebida): o GIF anima enquanto a pessoa fala ou com o mouse/foco
 * em cima dele, fica parado no resto do tempo e sempre com o app em segundo
 * plano (ver callAvatarMotion). Quem fala vem da própria chamada; o `animate`
 * de quem chama é ignorado: na call vale esta regra.
 */
function CallAvatar(props: React.ComponentProps<typeof Avatar>): React.JSX.Element {
  const background = useInBackground()
  const { userId, speaking: speakingProp } = props
  const speakingStore = useCallStore((s) => !!userId && s.speakingIds.includes(userId))
  const speaking = speakingProp ?? speakingStore
  return (
    <Avatar
      {...props}
      speaking={speaking}
      animate={callAvatarAnimate({ background, speaking })}
    />
  )
}

export default CallAvatar
