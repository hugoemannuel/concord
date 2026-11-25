import { useSegments } from 'expo-router'
import { useEffect } from 'react'
import { setErrorScreen, startErrorReports } from '../lib/errorReportStart'
import { routePattern } from '../lib/routePattern'

/** Liga o relatório de erros uma vez e mantém a tela atual (padrão da rota, sem valores). Não desenha nada. */
export function ErrorReportBridge(): null {
  const segments = useSegments()
  // Na renderização, não num efeito: a tela nova que quebra ao renderizar quebra antes do efeito rodar.
  setErrorScreen(routePattern(segments))
  useEffect(() => {
    startErrorReports()
  }, [])
  return null
}
