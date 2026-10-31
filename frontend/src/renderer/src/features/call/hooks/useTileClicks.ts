import { useEffect, useState } from 'react'
import { ClickDisambiguator } from '../lib/fullscreenControls'
import { routeTileClick, routeTileDoubleClick } from '../lib/tileClicks'

/**
 * Clique abre o foco, duplo clique é tela cheia: o clique espera a janela do
 * duplo para não trocar de tela (e sair do fullscreen) no meio do gesto.
 */
export function useTileClicks(
  onClick: (() => void) | undefined,
  canFullscreen: boolean,
  inFullscreen: boolean,
  toggleFullscreen: () => void
): { onClick: () => void; onDoubleClick: ((e: React.MouseEvent) => void) | undefined } {
  const [clicks] = useState(() => new ClickDisambiguator())
  useEffect(() => () => clicks.cancel(), [clicks])
  return {
    onClick: () => routeTileClick(clicks, onClick, inFullscreen, canFullscreen),
    onDoubleClick: canFullscreen
      ? (e) => routeTileDoubleClick(clicks, canFullscreen, e.target as Element, toggleFullscreen)
      : undefined
  }
}
