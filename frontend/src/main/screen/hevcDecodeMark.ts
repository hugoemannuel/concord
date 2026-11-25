import { app } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

// Marca "o H.265 chegou e não decodificou neste aparelho" (docs/adr/0073). O
// renderer avisa (screenHevcFailure); a próxima abertura lê a marca antes do
// `ready` e não anuncia H.265 para receber (chromiumFeatures). Vale alguns dias
// contados da primeira falha: um falso positivo tira o H.265 de um aparelho bom
// só por esse tempo, e o aparelho ruim volta a tentar e é marcado de novo.

export const HEVC_MARK_TTL_MS = 3 * 24 * 60 * 60 * 1000

/**
 * Lida no import de captureSwitches, antes do `app.setPath('userData', …/Concord)`
 * do index.ts: o caminho é montado igual a ele para o leitor e o gravador
 * acharem o mesmo arquivo.
 */
export const hevcMarkPath = (): string =>
  join(app.getPath('appData'), 'Concord', 'hevc-decode-failed.json')

interface HevcMark {
  savedAt: number
}

/** A marca vale agora? (data no futuro = relógio mexido: não vale) */
export function hevcReceiveOff(value: unknown, now: number): boolean {
  const savedAt = (value as Partial<HevcMark> | null)?.savedAt
  return typeof savedAt === 'number' && now - savedAt >= 0 && now - savedAt < HEVC_MARK_TTL_MS
}

/** O que gravar: nada se a marca ainda vale (a validade conta da primeira falha). */
export function nextHevcMark(value: unknown, now: number): HevcMark | null {
  return hevcReceiveOff(value, now) ? null : { savedAt: now }
}

function readMark(): unknown {
  try {
    return JSON.parse(readFileSync(hevcMarkPath(), 'utf8'))
  } catch {
    return null
  }
}

export function readHevcReceiveOff(now = Date.now()): boolean {
  return hevcReceiveOff(readMark(), now)
}

export function saveHevcDecodeMark(now = Date.now()): void {
  const mark = nextHevcMark(readMark(), now)
  if (!mark) return
  try {
    writeFileSync(hevcMarkPath(), JSON.stringify(mark))
  } catch {
    // Sem onde gravar: a próxima abertura segue anunciando o H.265.
  }
}
