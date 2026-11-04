import type { Channel, ChannelLayout, ChannelType } from '../api/channels'

export interface ChannelSection {
  key: string
  /** Sem título: os canais soltos, no topo da lista. */
  title: string | null
  channels: Channel[]
}

const TITLES: Record<ChannelType, string> = { text: 'Canais de texto', voice: 'Canais de voz' }

/** Sem a organização (ainda não veio, ou falhou): por tipo, como sempre foi. */
function sectionsByType(channels: Channel[]): ChannelSection[] {
  return (['text', 'voice'] as const)
    .map((kind) => ({
      key: kind,
      title: TITLES[kind],
      channels: channels.filter((c) => c.type === kind).sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    }))
    .filter((section) => section.channels.length > 0)
}

/**
 * Os canais soltos no topo (texto e voz na mesma lista) e depois as categorias, na
 * ordem da organização. A API só manda o que o membro pode ver: categoria privada de
 * quem não participa nem chega aqui. Canal recém-criado, ainda sem lugar, fica solto.
 */
export function channelSections(channels: Channel[], layout?: ChannelLayout | null): ChannelSection[] {
  if (!layout) return sectionsByType(channels)
  const placement = new Map(layout.channels.map((item) => [item.channel_id, item]))
  const known = new Set(layout.categories.map((category) => category.id))
  const ordered = channels
    .map((channel, index) => ({ channel, index, place: placement.get(channel.id) }))
    .sort((a, b) => (a.place?.position ?? Number.MAX_SAFE_INTEGER) - (b.place?.position ?? Number.MAX_SAFE_INTEGER) || a.index - b.index)
  const inCategory = (id: string | null): Channel[] =>
    ordered
      .filter(({ place }) => (place?.category_id && known.has(place.category_id) ? place.category_id : null) === id)
      .map(({ channel }) => channel)
  const loose = inCategory(null)
  const categories = layout.categories.map((category) => ({ key: category.id, title: category.name, channels: inCategory(category.id) }))
  return loose.length > 0 ? [{ key: 'soltos', title: null, channels: loose }, ...categories] : categories
}
