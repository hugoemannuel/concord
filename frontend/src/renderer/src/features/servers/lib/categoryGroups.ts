/** Agrupa canais visíveis sem descartar os que ainda não têm categoria carregada. */
export function groupChannelsByCategory<C extends { id: string }, T extends { category_id?: string | null }>(
  categories: C[],
  channels: T[]
): { uncategorized: T[]; groups: { category: C; channels: T[] }[] } {
  const groups = categories.map((category) => ({ category, channels: [] as T[] }))
  const byId = new Map(groups.map((group) => [group.category.id, group]))
  const uncategorized: T[] = []
  for (const channel of channels) {
    const group = channel.category_id ? byId.get(channel.category_id) : undefined
    if (group) group.channels.push(channel)
    else uncategorized.push(channel)
  }
  return { uncategorized, groups }
}
