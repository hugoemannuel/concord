import { app, ipcMain, MessageChannelMain, type MessagePortMain, type WebContents } from 'electron'
import { spawn, type ChildProcess } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import { appendLog, logPath } from '../app/appLog'
import { reportHelperExit } from '../errorReport/mainErrors'

// Som só da janela compartilhada (Windows 10 2004+): o helper nativo
// concord-audio.exe captura o áudio do processo dono da janela e manda PCM
// float32 48 kHz estéreo; repassamos ao renderer por um MessagePort.

const FRAME_BYTES = 8 // 2 canais × float32
const READY_TIMEOUT_MS = 1500

/** "window:<hwnd>:0" → hwnd; telas inteiras não têm janela. */
export function hwndFromSourceId(sourceId: string): string | null {
  const match = /^window:(\d+)(?::|$)/.exec(sourceId)
  return match ? match[1] : null
}

/** O helper escreve "ready" numa linha própria quando a captura começa. */
export function isReadyLine(text: string): boolean {
  return /^ready\r?$/m.test(text)
}

/** Junta pedaços do stdout em quadros inteiros (o pipe corta onde quiser). */
export class PcmChunker {
  private rest = Buffer.alloc(0)

  constructor(private readonly frameBytes = FRAME_BYTES) {}

  push(chunk: Buffer): Buffer {
    const data = this.rest.length ? Buffer.concat([this.rest, chunk]) : chunk
    const usable = data.length - (data.length % this.frameBytes)
    this.rest = Buffer.from(data.subarray(usable))
    return data.subarray(0, usable)
  }
}

/** Log do som da janela: %APPDATA%\\Concord\\logs\\audio.log no Windows. */
export function audioLogPath(): string {
  return logPath('audio.log')
}

export function logAudio(message: string): void {
  appendLog('audio.log', message)
}

let helper: ChildProcess | null = null
let port: MessagePortMain | null = null

export function helperPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'concord-audio.exe')
    : join(app.getAppPath(), 'resources', 'win', 'concord-audio.exe')
}

export function stopWindowAudio(): void {
  helper?.kill()
  helper = null
  port?.close()
  port = null
}

/**
 * Começa a capturar o som da janela. Resolve true quando o helper confirmou
 * ("ready") e o MessagePort já foi entregue ao renderer; false se não deu
 * (Windows antigo, helper ausente) — aí o chamador usa o som do sistema.
 */
export function startWindowAudio(hwnd: string, contents: WebContents): Promise<boolean> {
  stopWindowAudio()
  const path = helperPath()
  if (process.platform !== 'win32') return Promise.resolve(false)
  if (!existsSync(path)) {
    logAudio(`helper não encontrado em ${path}`)
    return Promise.resolve(false)
  }
  logAudio(`iniciando captura da janela ${hwnd}`)

  return new Promise((resolve) => {
    // stdin aberto: quando a Salinha morre, o pipe fecha e o helper sai junto.
    const child = spawn(path, ['window', hwnd], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    })
    helper = child
    let settled = false
    const finish = (ok: boolean): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (!ok && helper === child) stopWindowAudio()
      resolve(ok)
    }
    const timer = setTimeout(() => {
      if (!settled) logAudio(`sem "ready" em ${READY_TIMEOUT_MS} ms`)
      finish(false)
    }, READY_TIMEOUT_MS)

    child.on('error', (err) => {
      logAudio(`falha ao iniciar o helper: ${err.message}`)
      finish(false)
    })
    child.on('exit', (code, signal) => {
      logAudio(`helper saiu (código ${code})`)
      finish(false)
      // Ainda é o helper atual: ninguém pediu (stopWindowAudio já o teria trocado).
      if (helper === child) {
        reportHelperExit('concord-audio', code, signal)
        stopWindowAudio()
      }
    })
    child.stderr?.setEncoding('utf8')
    child.stderr?.on('data', (text: string) => {
      const ready = isReadyLine(text)
      logAudio(`helper: ${text.trim()}`)
      if (!ready || settled) return
      const channel = new MessageChannelMain()
      port = channel.port1
      contents.postMessage('screen-audio:port', null, [channel.port2])
      const chunker = new PcmChunker()
      child.stdout?.on('data', (chunk: Buffer) => {
        const frames = chunker.push(chunk)
        if (frames.length === 0 || !port) return
        // cópia própria: o buffer do Node pode ser reaproveitado
        port.postMessage(frames.buffer.slice(frames.byteOffset, frames.byteOffset + frames.length))
      })
      finish(true)
    })
  })
}

export function registerScreenAudio(): void {
  ipcMain.on('screen-audio:stop', stopWindowAudio)
  app.on('before-quit', stopWindowAudio)
  app.on('render-process-gone', stopWindowAudio)
}
