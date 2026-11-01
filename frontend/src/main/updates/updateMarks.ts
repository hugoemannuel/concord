import { app } from 'electron'
import { readFileSync } from 'fs'
import { rm, writeFile } from 'fs/promises'
import { join } from 'path'
import type { ReleaseId } from './updatePolicy'

// Marcas do atualizador gravadas na pasta de dados do app (sobrevivem ao
// reinício): versão recusada e aviso do sandbox já mostrado.

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

// Atualização recusada (assinatura ou pacote inválido): o mesmo par versão +
// sha512 nunca é baixado de novo, nem depois de reiniciar.
const refusedPath = (): string => join(app.getPath('userData'), 'update-refused.json')

export function readRefused(): ReleaseId | null {
  try {
    const value = JSON.parse(readFileSync(refusedPath(), 'utf8')) as Partial<ReleaseId>
    return typeof value.version === 'string'
      ? { version: value.version, sha512: typeof value.sha512 === 'string' ? value.sha512 : '' }
      : null
  } catch {
    return null
  }
}

export function saveRefused(release: ReleaseId | null): void {
  const write = release
    ? writeFile(refusedPath(), JSON.stringify(release))
    : rm(refusedPath(), { force: true })
  void write.catch(() => {})
}
