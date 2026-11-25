import { ipcRenderer } from 'electron'
import { ERROR_REPORT_TAKE, type MainError } from '../shared/errorReport'

// window.api.errorReport: os erros do main do Electron, já limpos, para o
// renderer mandar com a conta dele (main/errorReport, docs/adr/0068).
export const errorReportApi = {
  /** Devolve e esvazia a fila do main. */
  take(): Promise<MainError[]> {
    return ipcRenderer.invoke(ERROR_REPORT_TAKE)
  }
}

export type ErrorReportApi = typeof errorReportApi
