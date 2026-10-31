import VideoFill from './VideoFill'

/** Vídeo do tile: transmissão e tela cheia mostram inteiro (contain); câmera preenche (cover). */
export default function TileVideo({
  stream,
  isScreen,
  inFullscreen,
  mirror,
  onAspect
}: {
  stream: MediaStream | null
  isScreen: boolean
  inFullscreen: boolean
  /** Espelha o vídeo (câmera local). */
  mirror: boolean
  onAspect?: (aspect: number) => void
}): React.JSX.Element | null {
  if (!stream) return null
  return (
    <VideoFill
      stream={stream}
      fit={isScreen || inFullscreen ? 'contain' : 'cover'}
      mirror={mirror}
      square={inFullscreen}
      onAspect={onAspect}
    />
  )
}
