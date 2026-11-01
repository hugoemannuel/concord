import { app } from 'electron'
import { readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { parseTitleBarColors } from '../window/windowPolicy'
import type { SplashColors } from './splashPage'

// Marcas da janelinha de abertura na pasta de dados do app (sobrevivem ao
// reinício): as cores do tema e o "reabrir escondido" depois de instalar.

const themePath = (): string => join(app.getPath('userData'), 'splash-theme.json')
const hiddenPath = (): string => join(app.getPath('userData'), 'splash-hidden.json')

/** A instalação reabre o app em segundos; marca mais velha que isso é de outra abertura. */
export const HIDDEN_RELAUNCH_MAX_AGE_MS = 10 * 60_000

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

function write(path: string, value: unknown): void {
  try {
    writeFileSync(path, JSON.stringify(value))
  } catch {
    // sem onde gravar: a próxima abertura usa o padrão
  }
}

/** Cores do tema da última vez que o app abriu (a janelinha abre antes do renderer). */
export function readSplashColors(): SplashColors | null {
  return parseTitleBarColors(readJson(themePath()))
}

export function saveSplashColors(colors: SplashColors): void {
  const saved = readSplashColors()
  if (saved?.color === colors.color && saved.symbolColor === colors.symbolColor) return
  write(themePath(), colors)
}

/**
 * Aberto pelo login (escondido) e instalando: o instalador do Windows reabre o
 * app sem o --hidden. A marca diz à próxima abertura para ficar na bandeja.
 */
export function saveHiddenRelaunch(now = Date.now()): void {
  write(hiddenPath(), { savedAt: now })
}

export function clearHiddenRelaunch(): void {
  try {
    rmSync(hiddenPath(), { force: true })
  } catch {
    // sem permissão: a marca expira sozinha (HIDDEN_RELAUNCH_MAX_AGE_MS)
  }
}

/** Lê e apaga a marca: vale uma vez, se for recente. */
export function takeHiddenRelaunch(now = Date.now()): boolean {
  const value = readJson(hiddenPath()) as { savedAt?: unknown } | null
  if (value === null) return false
  clearHiddenRelaunch()
  const savedAt = value.savedAt
  return (
    typeof savedAt === 'number' && now - savedAt >= 0 && now - savedAt <= HIDDEN_RELAUNCH_MAX_AGE_MS
  )
}
