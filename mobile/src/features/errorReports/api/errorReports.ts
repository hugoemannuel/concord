import Constants from 'expo-constants'
import { Platform } from 'react-native'
import { request } from '../../../shared/api/client'
import type { ErrorReport } from '../lib/errorQueue'

export interface ErrorReportContext {
  os: string
  app_version: string
  target: 'android'
}

/** De onde vem o erro: Android + nível da API do sistema, versão do app (app.config.ts). */
export function reportContext(): ErrorReportContext {
  return {
    os: `Android ${Platform.Version}`,
    app_version: Constants.expoConfig?.version ?? '0.0.0',
    target: 'android'
  }
}

/** POST /api/obs/errors com a conta logada (contrato do plano do ADR 0068). */
export function postErrors(errors: ErrorReport[], context: ErrorReportContext = reportContext()): Promise<void> {
  return request<void>('/obs/errors', { method: 'POST', body: JSON.stringify({ context, errors }) })
}
