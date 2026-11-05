import { execFile } from 'child_process'
import { encodePowerShell } from './smtcPowerShell'

// Quais processos têm janela visível. O `MainWindowHandle` do .NET só aponta
// janela de topo visível (minimizada conta); janela oculta e ícone da bandeja
// dão 0. O `tasklist /v` não serve: ele mostra o título até de janela oculta.

const TIMEOUT_MS = 10_000

function quote(text: string): string {
  return `'${text.replace(/'/g, "''")}'`
}

/**
 * Script que escreve, um por linha, os processos de `exes` com janela visível.
 * O `exit 0` é porque o Get-Process sai com 1 se algum nome não existir.
 */
export function visibleWindowScript(exes: readonly string[]): string {
  const unique = new Set(exes.map((exe) => exe.toLowerCase().replace(/\.exe$/, '')))
  const names = [...unique].map(quote).join(',')
  return `Get-Process -Name ${names} -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | ForEach-Object { $_.ProcessName }; exit 0`
}

/** Saída do script → executáveis (minúsculos, com .exe). */
export function parseWindowed(output: string): Set<string> {
  const names = output
    .split(/\r?\n/)
    .map((line) => line.trim().toLowerCase())
    .filter(Boolean)
  return new Set(names.map((name) => `${name}.exe`))
}

/**
 * Os executáveis de `exes` com janela visível. Se o PowerShell falhar, devolve
 * todos (melhor mostrar o jogo como antes do que escondê-lo sempre).
 */
export function exesWithVisibleWindow(exes: readonly string[]): Promise<Set<string>> {
  const args = ['-NoProfile', '-NonInteractive', '-EncodedCommand']
  args.push(encodePowerShell(visibleWindowScript(exes)))
  return new Promise((resolve) => {
    execFile('powershell', args, { windowsHide: true, timeout: TIMEOUT_MS }, (error, stdout) =>
      resolve(error ? new Set(exes) : parseWindowed(stdout))
    )
  })
}
