import { API_BASE_URL } from '../../../shared/lib/config'
import type { ServerArt } from '../api/serverProfile'
import { useServerProfile } from '../hooks/useServerProfile'
import { artBackground, resolveArt } from '../lib/serverArt'

/** A faixa do servidor que a pessoa está vendo (null = sem faixa). */
export function useServerStrip(serverId: string | undefined): ServerArt | null {
  return resolveArt(useServerProfile(serverId)?.strip)
}

/** O desenho da faixa, atrás do cabeçalho, com um véu para o nome continuar legível. */
export default function ServerStripArt({ art }: { art: ServerArt }): React.JSX.Element {
  return (
    <div aria-hidden="true" className="absolute inset-0 -z-10" style={artBackground(art, API_BASE_URL)}>
      <div className="absolute inset-0 bg-gradient-to-b from-black/55 to-transparent" />
    </div>
  )
}
