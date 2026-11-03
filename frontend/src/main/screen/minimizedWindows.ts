import { execFile } from 'child_process'

// Jogo em tela cheia se minimiza ao perder o foco, e janela minimizada não entra
// na lista de fontes: para abrir o seletor a pessoa tira o jogo da própria lista.
// Aqui ele volta a ser oferecido e, ao ser escolhido, é restaurado (shareSource).

/** Janela interna do jogo: nunca é o que a pessoa quer transmitir. */
const NOISE_WINDOWS = new Set(['D3DProxyWindow'])

export interface MinimizedWindow {
  hwnd: string
  title: string
}

/** O que o modal de seleção recebe; sem miniatura ele mostra um ícone. */
export interface PickerSource {
  id: string
  name: string
  thumbnail: string
  appIcon: string | null
  displayId: string
}

/** Linhas "hwnd<tab>título"; o resto (linha vazia, sem título) é ignorado. */
export function parseMinimizedWindows(stdout: string): MinimizedWindow[] {
  return stdout.split(/\r?\n/).flatMap((line) => {
    const match = /^(\d+)\t(.+)$/.exec(line)
    const title = match?.[2].trim()
    return match && title ? [{ hwnd: match[1], title }] : []
  })
}

export function pickerSources(
  sources: readonly PickerSource[],
  minimized: readonly MinimizedWindow[]
): PickerSource[] {
  const listed = sources.filter((source) => !NOISE_WINDOWS.has(source.name))
  const ids = new Set(sources.map((source) => source.id))
  const extra = minimized
    .map(({ hwnd, title }) => ({
      id: `window:${hwnd}:0`,
      name: title,
      thumbnail: '',
      appIcon: null,
      displayId: ''
    }))
    .filter((source) => !ids.has(source.id))
  return [...listed, ...extra]
}

/** -EncodedCommand: aspas e crases chegam intactas ao PowerShell. */
function runPowerShell(script: string): Promise<string> {
  const encoded = Buffer.from(script, 'utf16le').toString('base64')
  return new Promise((resolve) => {
    execFile(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
      { windowsHide: true, timeout: 5000 },
      (error, stdout) => resolve(error ? '' : stdout)
    )
  })
}

/** Janelas principais minimizadas dos outros apps. Só no Windows; falhar = lista vazia. */
export async function listMinimizedWindows(): Promise<MinimizedWindow[]> {
  if (process.platform !== 'win32') return []
  return parseMinimizedWindows(
    await runPowerShell(`
      [Console]::OutputEncoding = [Text.Encoding]::UTF8
      Add-Type -Name Iconic -Namespace Salinha -MemberDefinition '[DllImport("user32.dll")] public static extern bool IsIconic(System.IntPtr h);'
      Get-Process | Where-Object { $_.Id -ne ${process.pid} -and $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -and [Salinha.Iconic]::IsIconic($_.MainWindowHandle) } |
        ForEach-Object { "$($_.MainWindowHandle.ToInt64())\`t$($_.MainWindowTitle)" }
    `)
  )
}

/** Traz a janela de volta para a frente. `hwnd` só tem dígitos (hwndFromSourceId). */
export function restoreWindow(hwnd: string): void {
  // Só dar o foco não basta: a janela continua minimizada (9 = SW_RESTORE).
  void runPowerShell(`
    Add-Type -Name Restore -Namespace Salinha -MemberDefinition '[DllImport("user32.dll")] public static extern bool ShowWindowAsync(System.IntPtr h, int c); [DllImport("user32.dll")] public static extern bool SetForegroundWindow(System.IntPtr h);'
    [void][Salinha.Restore]::ShowWindowAsync([IntPtr]${hwnd}, 9)
    [void][Salinha.Restore]::SetForegroundWindow([IntPtr]${hwnd})
  `)
}
