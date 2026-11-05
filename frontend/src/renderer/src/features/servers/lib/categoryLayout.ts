import type { ChannelPlacement } from '../api/categories'

/** Um canal recém-criado também aparece enquanto o layout é atualizado. */
export function channelsWithPlacement<T extends { id: string }>(channels: T[], placements: ChannelPlacement[]): (T & { category_id: string | null; synced: boolean })[] {
  const byId = new Map(placements.map((placement) => [placement.channel_id, placement]))
  return channels.map((channel, index) => ({
    channel, index, placement: byId.get(channel.id)
  })).sort((a, b) => (a.placement?.position ?? Number.MAX_SAFE_INTEGER) - (b.placement?.position ?? Number.MAX_SAFE_INTEGER) || a.index - b.index)
    .map(({ channel, placement }) => ({ ...channel, category_id: placement?.category_id ?? null, synced: placement?.synced ?? true }))
}

/** O que "Mover para cima/baixo" do menu faz: troca de lugar com o vizinho, de qualquer tipo. */
export function categoryMenuMove<T extends { id: string; category_id?: string | null }>(group: T[], from: number, to: number): { channel: string; category: string | null; before: string | null } | null {
  const moving = group[from]
  const target = group[to]
  if (!moving || !target) return null
  return { channel: moving.id, category: moving.category_id ?? null, before: to < from ? target.id : group[to + 1]?.id ?? null }
}
