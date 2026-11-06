import { mix } from '../../appearance/lib/colorMath'

// Fundo "Arco-íris do orgulho": as seis faixas da bandeira pride, com uma
// camada escura por cima para o texto do cartão continuar legível.

/** Faixas da bandeira, de cima para baixo. */
export const PRIDE_STRIPES = ['#e40303', '#ff8c00', '#ffed00', '#008026', '#24408e', '#732982']

/**
 * As faixas já escurecidas: as cores reais do fundo (anel do avatar, contraste
 * do texto e dos cargos). A camada entra na própria cor para o fundo ser uma
 * imagem só, como o das bordas em degradê exigem.
 */
export const PRIDE_PALETTE = PRIDE_STRIPES.map((stripe) => mix(stripe, '#0a0a14', 0.55))

/** Faixas de cor dura; o ângulo é o do degradê (180° = faixas horizontais). */
export function prideGradient(angle: number): string {
  const step = 100 / PRIDE_PALETTE.length
  const stops = PRIDE_PALETTE.map(
    (c, i) => `${c} ${Math.round(i * step * 100) / 100}% ${Math.round((i + 1) * step * 100) / 100}%`
  )
  return `linear-gradient(${angle}deg, ${stops.join(', ')})`
}
