import { execFile } from 'child_process'
import { GAMES } from '../../shared/gameCatalog'
import { hwndFromSourceId } from './screenAudio'

// Transmitir o jogo em atividade direto, sem o modal de seleção: acha, entre as
// janelas que o Electron pode capturar, a do jogo detectado.

const PREFERENCE_TTL_MS = 10_000

/** Nomes de processo (sem .exe) do jogo do catálogo; vazio se for de fora dele. */
export function exeProcessNames(gameName: string): string[] {
  const game = GAMES.find((g) => g.name === gameName)
  return (game?.exes ?? []).map((exe) => exe.replace(/\.exe$/i, ''))
}

/**
 * Fonte de janela do jogo: a do processo dele (hwnd) ou, na falta, a que tem o
 * nome do jogo no título. Telas inteiras nunca entram. null = não achou.
 */
export function pickGameWindow(
  sources: ReadonlyArray<{ id: string; name: string }>,
  hwnds: readonly string[],
  gameName: string
): string | null {
  const windows = sources.filter((s) => hwndFromSourceId(s.id) !== null)
  const byProcess = windows.find((s) => hwnds.includes(hwndFromSourceId(s.id) ?? ''))
  if (byProcess) return byProcess.id
  // Processo com janela fora da lista = minimizado: compartilhar o restaura (shareSource).
  if (hwnds.length > 0) return `window:${hwnds[0]}:0`
  const wanted = gameName.trim().toLowerCase()
  const byTitle = wanted ? windows.find((s) => s.name.toLowerCase().includes(wanted)) : undefined
  return byTitle?.id ?? null
}

export interface GameWindowDeps {
  windows: () => Promise<Array<{ id: string; name: string }>>
  hwnds: (processNames: string[]) => Promise<string[]>
}

/** Id da fonte de janela do jogo (nome vindo do renderer); null = não achou. */
export async function findGameWindow(
  gameName: unknown,
  deps: GameWindowDeps
): Promise<string | null> {
  if (typeof gameName !== 'string') return null
  const [sources, hwnds] = await Promise.all([deps.windows(), deps.hwnds(exeProcessNames(gameName))])
  return pickGameWindow(sources, hwnds, gameName)
}

/** Janelas principais (hwnd) dos processos informados. Só no Windows. */
export function listProcessWindows(processNames: readonly string[]): Promise<string[]> {
  if (process.platform !== 'win32' || processNames.length === 0) return Promise.resolve([])
  const names = processNames.map((n) => `'${n.replace(/'/g, "''")}'`).join(',')
  const script =
    `Get-Process -Name ${names} -ErrorAction SilentlyContinue | ` +
    'Where-Object { $_.MainWindowHandle -ne 0 } | ' +
    'ForEach-Object { $_.MainWindowHandle.ToInt64() }'
  return new Promise((resolve) => {
    execFile(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true, timeout: 5000 },
      (error, stdout) =>
        resolve(error ? [] : stdout.split(/\r?\n/).filter((line) => /^\d+$/.test(line.trim())))
    )
  })
}

/** Fonte escolhida de antemão: o próximo getDisplayMedia a usa, uma vez só. */
export class PreferredSource {
  private id: string | null = null
  private at = 0

  constructor(private readonly now: () => number = Date.now) {}

  set(id: string): void {
    this.id = id
    this.at = this.now()
  }

  take(): string | null {
    const id = this.id
    const fresh = this.now() - this.at <= PREFERENCE_TTL_MS
    this.id = null
    return id && fresh ? id : null
  }

  clear(): void {
    this.id = null
  }
}
