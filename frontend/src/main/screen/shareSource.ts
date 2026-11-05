import { displayAudioMode, warnWindowAudioFallback } from './displayMedia'
import type { DisplayStreams } from './displayPicker'
import { hwndFromSourceId } from './screenAudio'

// Da fonte escolhida (modal ou atalho do jogo) ao que o getDisplayMedia recebe.

type Source = Electron.DesktopCapturerSource

export interface ShareDeps {
  listSources: () => Promise<Source[]>
  /** Cada escolha começa do zero: nada do compartilhamento anterior. */
  stopWindowAudio: () => void
  startWindowAudio: (hwnd: string) => Promise<boolean>
  watchWindow: (sourceId: string) => void
  stopWatch: () => void
  warnAudioFallback: () => void
  log: (message: string) => void
  audioRequested: boolean
  platform: NodeJS.Platform
  restoreWindow: (hwnd: string) => void
  sleep: (ms: number) => Promise<void>
}

/** Jogo em tela cheia leva alguns segundos para voltar do minimizado. */
const RESTORE_POLL_MS = 500
const RESTORE_ATTEMPTS = 24

/** A fonte da lista; janela minimizada (fora dela) é restaurada e esperada. */
async function findSource(sourceId: string, d: ShareDeps): Promise<Source | undefined> {
  const find = async (): Promise<Source | undefined> =>
    (await d.listSources()).find((s) => s.id === sourceId)
  const listed = await find()
  const hwnd = hwndFromSourceId(sourceId)
  if (listed || hwnd === null) return listed
  d.restoreWindow(hwnd)
  for (let attempt = 0; attempt < RESTORE_ATTEMPTS; attempt++) {
    await d.sleep(RESTORE_POLL_MS)
    const source = await find()
    if (source) return source
  }
  return undefined
}

async function windowSound(source: Source, d: ShareDeps): Promise<boolean> {
  const hwnd = hwndFromSourceId(source.id)
  const wanted = hwnd !== null && d.audioRequested && d.platform === 'win32'
  return wanted ? d.startWindowAudio(hwnd) : false
}

function watchOrStop(source: Source, d: ShareDeps): void {
  if (source.id.startsWith('window:')) d.watchWindow(source.id)
  else d.stopWatch()
}

/** As fontes de vídeo (e som) a entregar; null = recusar o pedido. */
export async function shareStreams(sourceId: string, d: ShareDeps): Promise<DisplayStreams | null> {
  try {
    const source = await findSource(sourceId, d)
    d.stopWindowAudio()
    if (!source) {
      d.log(`fonte ${sourceId} não encontrada`)
      return null
    }
    const base = { sourceId: source.id, audioRequested: d.audioRequested, platform: d.platform }
    const mode = displayAudioMode({ ...base, windowAudioOk: await windowSound(source, d) })
    d.log(`compartilhando "${source.name}" (${source.id}): som = ${mode}`)
    if (warnWindowAudioFallback({ ...base, mode })) d.warnAudioFallback()
    watchOrStop(source, d)
    return mode === 'system' ? { video: source, audio: 'loopback' } : { video: source }
  } catch (err) {
    d.log(`falha ao compartilhar ${sourceId}: ${String(err)}`)
    return null
  }
}
