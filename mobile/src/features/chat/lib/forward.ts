import type { ForwardedFrom } from '../api/messages'

// Porte do desktop (features/chat/lib/forward): a origem mostrada na encaminhada.

/** "Encaminhada · de Ana · #geral · Salinha" (DM: "Mensagem direta"). */
export function forwardedLabel(ff: ForwardedFrom): string {
  const author = ff.author_name || ff.author_username || 'Alguém'
  if (!ff.channel_id) return `de ${author} · Mensagem direta`
  const channel = `#${ff.channel_name || 'canal'}`
  return `de ${author} · ${ff.server_name ? `${channel} · ${ff.server_name}` : channel}`
}
