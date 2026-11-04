// Catálogo dos efeitos do perfil e do fundo do app: id, rótulo e como é desenhado.

/**
 * Efeitos: os três primeiros são CSS (profileParticles.ts), os outros canvas
 * (lib/effects/). `color` é a cor de sempre do efeito; null = não tem cor
 * para escolher (paleta própria).
 */
export const PROFILE_EFFECTS: readonly {
  id: string
  label: string
  kind: 'none' | 'css' | 'canvas'
  color: string | null
}[] = [
  { id: 'none', label: 'Nenhum', kind: 'none', color: null },
  { id: 'particles', label: 'Partículas', kind: 'css', color: '#c4b5fd' },
  { id: 'sparkles', label: 'Brilhos', kind: 'css', color: '#ffd84d' },
  { id: 'snow', label: 'Neve', kind: 'css', color: '#ffffff' },
  { id: 'fire', label: 'Fogo', kind: 'canvas', color: '#ff7a1a' },
  { id: 'matrix', label: 'Matrix', kind: 'canvas', color: '#22ff88' },
  { id: 'glitch', label: 'Glitch', kind: 'canvas', color: null },
  { id: 'storm', label: 'Tempestade', kind: 'canvas', color: '#9ecbff' },
  { id: 'galaxy', label: 'Galáxia', kind: 'canvas', color: '#a78bfa' },
  { id: 'aurora', label: 'Aurora', kind: 'canvas', color: '#34d399' },
  { id: 'hearts', label: 'Corações', kind: 'canvas', color: '#ff4d8d' },
  { id: 'confetti', label: 'Confete', kind: 'canvas', color: null },
  { id: 'synthwave', label: 'Synthwave', kind: 'canvas', color: '#ff2bd6' },
  { id: 'rain', label: 'Chuva', kind: 'canvas', color: '#7cc4ff' }
]

/** Definição do efeito (desconhecido = "Nenhum"). */
export function effectDef(id: string): (typeof PROFILE_EFFECTS)[number] {
  return PROFILE_EFFECTS.find((e) => e.id === id) ?? PROFILE_EFFECTS[0]
}
