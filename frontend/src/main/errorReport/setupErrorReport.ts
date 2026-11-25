import { app, ipcMain, type BrowserWindow } from 'electron'
import { ERROR_REPORT_TAKE } from '../../shared/errorReport'
import { fromWindow } from '../window/ipcGuard'
import { isCleanExit, mainErrors, processGoneMessage, reportMainError, type GoneDetails } from './mainErrors'

// Erros do processo main para o relatório de erros (docs/adr/0068): exceções
// e promessas sem tratamento (o log no console continua), renderer e
// processos filhos do Chromium que caíram. A janela principal puxa a fila
// pelo IPC; sem janela, espera (não há push).

/** O que vira erro quando um processo some (o teste chama direto). */
export function recordProcessGone(kind: 'render-process-gone' | 'child-process-gone', details: GoneDetails): void {
  if (isCleanExit(details)) return
  mainErrors.add(kind, processGoneMessage(details))
}

const isEpipe = (value: unknown): boolean => (value as { code?: unknown } | null)?.code === 'EPIPE'

let handling = false

/**
 * Console e fila, sem laço: EPIPE (o stdout sem destino) é ignorado, senão o
 * console.error daqui lança outro EPIPE e volta para cá; e um erro que nasce
 * enquanto este é tratado (o próprio console falhando) não entra de novo.
 */
export function logUnhandled(label: string, value: unknown): void {
  if (handling || isEpipe(value)) return
  handling = true
  try {
    console.error(label, value)
  } catch {
    // sem console, o erro ainda vai para a fila
  } finally {
    reportMainError(value)
    handling = false
  }
}

export function setupErrorReport(getWindow: () => BrowserWindow | null): void {
  // Com um ouvinte, o Node não derruba o processo: o app segue como seguia com
  // o diálogo de erro do Electron, e o erro vai para o console e para a fila.
  process.on('uncaughtException', (error) => logUnhandled('[main] exceção sem tratamento:', error))
  process.on('unhandledRejection', (reason) => logUnhandled('[main] promessa rejeitada sem tratamento:', reason))
  app.on('render-process-gone', (_event, _contents, details) => recordProcessGone('render-process-gone', details))
  app.on('child-process-gone', (_event, details) => recordProcessGone('child-process-gone', details))
  // Só a janela principal esvazia a fila (o overlay e as atividades não).
  ipcMain.handle(ERROR_REPORT_TAKE, (event) => (fromWindow(event, getWindow) ? mainErrors.take() : []))
}
