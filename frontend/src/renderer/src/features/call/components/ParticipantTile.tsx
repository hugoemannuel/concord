import { useState } from 'react'
import type { CallUserInfo } from '../store/callStore'
import { useSoundboardStore } from '../store/soundboardStore'
import { useMusicStore } from '../../music/store/musicStore'
import { useStreamFullscreen } from '../hooks/useStreamFullscreen'
import { useTileClicks } from '../hooks/useTileClicks'
import { canTileFullscreen } from '../lib/fullscreenControls'
import { tileFillStyle, tileFrameClass, tileRootAttrs, type TileSize } from '../lib/tileFrame'
import { isMaestroIdentity } from '../../music/lib/music'
import LevelGlow from './LevelGlow'
import ScreenAnnotations from './ScreenAnnotations'
import ScreenTileOverlays from './ScreenTileOverlays'
import SoundBadge from './SoundBadge'
import TileAvatar from './TileAvatar'
import TileNameplate from './TileNameplate'
import TileVideoControls from './TileVideoControls'
import TileVideo from './TileVideo'

function ParticipantTile({
  user,
  speaking = false,
  selfMuted = false,
  deafened = false,
  serverMuted = false,
  serverDeafened = false,
  videoStream = null,
  size = 'lg',
  isScreen = false,
  mirror = false,
  onClick: onClickProp,
  onContextMenu,
  locallyMuted = false,
  action,
  onClose,
  streamAudioUserId,
  fullscreenable = true,
  watchers,
  hasHeaderOffset = false
}: {
  user: CallUserInfo
  speaking?: boolean
  selfMuted?: boolean
  deafened?: boolean
  /** Impostos por um moderador (silenciar/ensurdecer no servidor). */
  serverMuted?: boolean
  serverDeafened?: boolean
  /** Stream de vídeo (tela/câmera) exibido dentro do tile. */
  videoStream?: MediaStream | null
  size?: TileSize
  /** Modo compartilhamento de tela: object-contain + destaque verde + AO VIVO. */
  isScreen?: boolean
  /** Espelha o vídeo (câmera local). */
  mirror?: boolean
  onClick?: () => void
  /** Botão direito: menu do usuário (volume, silenciar…). */
  onContextMenu?: (e: React.MouseEvent) => void
  /** Silenciado por você (só você não ouve). */
  locallyMuted?: boolean
  /** Botão abaixo do avatar quando não há vídeo (ex.: "Assistir transmissão"). */
  action?: React.ReactNode
  /** Mostra o X de fechar a transmissão no canto superior direito (o esquerdo é do "Mover" do mosaico). */
  onClose?: () => void
  /** Live de outra pessoa: barra de mutar/volume (só para você) ao passar o mouse. */
  streamAudioUserId?: string
  /** Botão e duplo clique de tela cheia (só com vídeo; câmera e transmissão assistida). */
  fullscreenable?: boolean
  /** Espectadores assistindo à transmissão (ao vivo). */
  watchers?: CallUserInfo[]
  /** Espaço para não cobrir botões do cabeçalho da transmissão focada. */
  hasHeaderOffset?: boolean
}): React.JSX.Element {
  // Clicar no Maestro na call abre/fecha o painel "Tocando agora" (vídeo, fila…).
  const toggleMusicPanel = useMusicStore((s) => s.togglePanel)
  const onClick = onClickProp ?? (isMaestroIdentity(user.id) ? toggleMusicPanel : undefined)
  const activeSound = useSoundboardStore((s) => (isScreen ? undefined : s.activePlays[user.id]))
  const active = speaking || Boolean(activeSound)
  // 'fill': o tile calcula a largura pela proporção do vídeo.
  const [aspect, setAspect] = useState(16 / 9)

  const canFullscreen = canTileFullscreen(fullscreenable, !!videoStream)
  const {
    ref: tileRef,
    active: inFullscreen,
    toggle: toggleFullscreen
  } = useStreamFullscreen(canFullscreen)
  const clicks = useTileClicks(onClick, canFullscreen, inFullscreen, toggleFullscreen)

  return (
    <div
      ref={tileRef}
      onClick={clicks.onClick}
      onDoubleClick={clicks.onDoubleClick}
      onContextMenu={onContextMenu}
      {...tileRootAttrs(Boolean(onClick), isScreen, isMaestroIdentity(user.id))}
      style={inFullscreen ? undefined : tileFillStyle(size, aspect)}
      className={`group/tile relative flex items-center justify-center overflow-hidden transition-all ${tileFrameClass(
        { size, inFullscreen, isScreen, active, clickable: Boolean(onClick) }
      )}`}
    >
      <TileVideo
        stream={videoStream}
        isScreen={isScreen}
        inFullscreen={inFullscreen}
        mirror={mirror}
        onAspect={size === 'fill' ? setAspect : undefined}
      />
      <LevelGlow userId={user.id} isScreen={isScreen} />
      {!videoStream && (
        <TileAvatar
          user={user}
          big={size === 'lg'}
          active={active}
          isScreen={isScreen}
          action={action}
        />
      )}
      {activeSound && <SoundBadge userId={user.id} sound={activeSound} />}
      {!inFullscreen && (
        <ScreenTileOverlays
          user={user}
          watchers={watchers}
          hasHeaderOffset={hasHeaderOffset}
          isScreen={isScreen}
          onClose={onClose}
        />
      )}
      {isScreen && <ScreenAnnotations user={user} />}
      {videoStream && (
        <TileVideoControls
          inFullscreen={inFullscreen}
          user={user}
          streamAudioUserId={streamAudioUserId}
          canFullscreen={canFullscreen}
          toggleFullscreen={toggleFullscreen}
          watchers={watchers}
        />
      )}
      {!inFullscreen && (
        <TileNameplate
          user={user}
          isScreen={isScreen}
          locallyMuted={locallyMuted}
          voice={{ muted: selfMuted, deafened, serverMuted, serverDeafened }}
        />
      )}
    </div>
  )
}

export default ParticipantTile
