import { execFile } from 'child_process'
import { detectGame, exesNeedingWindow, withoutHiddenGames } from '../../shared/gameCatalog'
import { detectSteamGame, type SteamGame } from './steamGames'
import { exesWithVisibleWindow } from './visibleWindows'

// "Em atividade": olha os processos em andamento (como o Discord, não só a
// janela da frente) e avisa quando um jogo do catálogo abre ou fecha.

export interface DetectedGame {
  name: string
  /** Unix em ms de quando a Salinha o viu abrir. */
  startedAt: number
  /** appid e ícone na Steam; só em jogos da Steam fora do catálogo. */
  appId?: number
  iconHash?: string
}

const POLL_INTERVAL_MS = 15_000

/** Saída de `tasklist /fo csv /nh` → nomes dos executáveis. */
export function parseTasklist(output: string): string[] {
  const names: string[] = []
  for (const line of output.split(/\r?\n/)) {
    const match = /^"([^"]+)"/.exec(line)
    if (match) names.push(match[1])
  }
  return names
}

/**
 * Mantém o início se for o mesmo jogo; senão, começa agora (ou some).
 * O catálogo vence; `steamGame` (jogo da Steam fora do catálogo) é o plano B.
 */
export function nextGame(
  previous: DetectedGame | null,
  runningExes: readonly string[],
  now: number,
  steamGame: SteamGame | null = null
): DetectedGame | null {
  const catalog = detectGame(runningExes)
  const name = catalog?.name ?? steamGame?.name
  if (!name) return null
  if (previous && previous.name === name) return previous
  if (catalog || !steamGame) return { name, startedAt: now }
  return {
    name,
    startedAt: now,
    appId: steamGame.appId,
    ...(steamGame.iconHash ? { iconHash: steamGame.iconHash } : {})
  }
}

/**
 * Tira os jogos que só contam com janela (Roblox) e estão sem ela: o processo
 * fica vivo em segundo plano depois de fechado. Só pergunta pelas janelas
 * (`checkWindows`) quando um desses está em andamento.
 */
export async function visibleGameExes(
  runningExes: string[],
  checkWindows: (exes: string[]) => Promise<Set<string>>
): Promise<string[]> {
  const needing = exesNeedingWindow(runningExes)
  if (needing.length === 0) return runningExes
  return withoutHiddenGames(runningExes, await checkWindows(needing))
}

function listProcesses(): Promise<string[]> {
  return new Promise((resolve) => {
    execFile(
      'tasklist',
      ['/fo', 'csv', '/nh'],
      { windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
      (error, stdout) => resolve(error ? [] : parseTasklist(stdout))
    )
  })
}

let timer: NodeJS.Timeout | null = null
let current: DetectedGame | null = null

/** Só no Windows. `onChange` roda quando o jogo muda (null = parou). */
export function startGameDetector(onChange: (game: DetectedGame | null) => void): void {
  if (timer || process.platform !== 'win32') return
  const tick = async (): Promise<void> => {
    const [running, steamGame] = await Promise.all([listProcesses(), detectSteamGame()])
    const exes = await visibleGameExes(running, exesWithVisibleWindow)
    const next = nextGame(current, exes, Date.now(), steamGame)
    if (next?.name === current?.name) return
    current = next
    onChange(next)
  }
  void tick()
  timer = setInterval(() => void tick(), POLL_INTERVAL_MS)
}

export function stopGameDetector(onChange?: (game: DetectedGame | null) => void): void {
  if (timer) clearInterval(timer)
  timer = null
  if (current) {
    current = null
    onChange?.(null)
  }
}

/** Jogo atual (para quem liga o detector depois da janela abrir). */
export function currentGame(): DetectedGame | null {
  return current
}
