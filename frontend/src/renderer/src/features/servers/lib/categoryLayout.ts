import type { ChannelPlacement } from '../api/categories'

/** Um canal recém-criado também aparece enquanto o layout é atualizado. */
export function channelsWithPlacement<T extends { id: string }>(channels: T[], placements: ChannelPlacement[]): (T & { category_id: string | null })[] {
  const byId = new Map(placements.map((placement) => [placement.channel_id, placement]))
  return channels.map((channel, index) => ({
    channel, index, placement: byId.get(channel.id)
  })).sort((a, b) => (a.placement?.position ?? Number.MAX_SAFE_INTEGER) - (b.placement?.position ?? Number.MAX_SAFE_INTEGER) || a.index - b.index)
    .map(({ channel, placement }) => ({ ...channel, category_id: placement?.category_id ?? null }))
}

/** ID diante do qual inserir, após mover uma linha na lista visível. */
export function nextChannelAfterMove(ids: string[], from: number, to: number): string | null {
  const ordered = [...ids]
  const [moved] = ordered.splice(from, 1)
  ordered.splice(to, 0, moved)
  return ordered[to + 1] ?? null
}

export function categoryMenuMove<T extends { id: string; category_id?: string | null }>(group: T[], sameType: T[], from: number, to: number): { channel: string; category: string | null; before: string | null } | null {
  const moving = sameType[from]
  const target = sameType[to]
  if (!moving || !target) return null
  const targetIndex = group.findIndex((item) => item.id === target.id)
  return { channel: moving.id, category: moving.category_id ?? null, before: to < from ? target.id : group[targetIndex + 1]?.id ?? null }
}

export function validCategoryDrag(id: string, before: string | null, channels: { id: string }[]): boolean {
  return Boolean(id && id !== before && channels.some((channel) => channel.id === id))
}
