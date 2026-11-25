import { useSegments } from 'expo-router'
import { setErrorScreen } from '../lib/errorReportStart'
import { routePattern } from '../lib/routePattern'

/**
 * Mantém a tela atual do relatório de erros (padrão da rota, sem valores). Não desenha
 * nada. Quem liga o relatório é o topo do app/_layout.tsx, antes da primeira renderização.
 */
export function ErrorReportBridge(): null {
  const segments = useSegments()
  // Na renderização, não num efeito: a tela nova que quebra ao renderizar quebra antes do efeito rodar.
  setErrorScreen(routePattern(segments))
  return null
}
