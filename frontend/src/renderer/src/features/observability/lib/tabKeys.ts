// Teclado da barra de abas (padrão "Tabs" do WAI-ARIA APG): setas andam e dão a
// volta, Home e End vão às pontas.

const STEP: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1 }

/** A aba que a tecla escolhe, ou null se a tecla não é da barra. */
export function nextTabIndex(current: number, key: string, count: number): number | null {
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  const step = STEP[key]
  return step === undefined ? null : (current + step + count) % count
}
