// Última versão cujas novidades a pessoa já viu, neste aparelho (ADR 0066).

export const SEEN_VERSION_KEY = 'salinha:novidades-vistas'

export function readSeenVersion(): string | null {
  try {
    return localStorage.getItem(SEEN_VERSION_KEY)
  } catch {
    return null
  }
}

export function writeSeenVersion(version: string): void {
  try {
    localStorage.setItem(SEEN_VERSION_KEY, version)
  } catch {
    // Armazenamento bloqueado: as novidades voltam na próxima abertura.
  }
}
