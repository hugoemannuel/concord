// Textos calculados do cartão do servidor. Puro.

/** "Criado em mar. de 2026"; null sem data válida. */
export function createdLabel(iso: string | undefined): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  const when = date.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric', timeZone: 'UTC' })
  return `Criado em ${when}`
}
