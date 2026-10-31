import { app } from 'electron'
import { readFileSync } from 'fs'
import { writeFile } from 'fs/promises'
import { join } from 'path'

// Marcas do atualizador gravadas na pasta de dados do app (sobrevivem ao
// reinício): versão já verificada e aviso do sandbox já mostrado.

// Versão já baixada e verificada (sobrevive ao reinício do app): só ela pode
// ser instalada sozinha ao abrir.
const verifiedPath = (): string => join(app.getPath('userData'), 'update-verified.json')

export function readVerifiedVersion(): string | null {
  try {
    return (
      (JSON.parse(readFileSync(verifiedPath(), 'utf8')) as { version?: string }).version ?? null
    )
  } catch {
    return null
  }
}

export function saveVerifiedVersion(version: string): void {
  void writeFile(verifiedPath(), JSON.stringify({ version })).catch(() => {})
}

const sandboxNoticePath = (): string => join(app.getPath('userData'), 'sandbox-notice.json')

export function readSandboxNoticeShown(): boolean {
  try {
    readFileSync(sandboxNoticePath())
    return true
  } catch {
    return false
  }
}

export function saveSandboxNoticeShown(): void {
  void writeFile(sandboxNoticePath(), JSON.stringify({ shown: true })).catch(() => {})
}
