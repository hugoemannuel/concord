import type { Readable, Writable } from 'stream'
import {
  parseNativeLiveEvent,
  type NativeLiveEvent,
  type NativeLiveQuality,
  type NativeLiveStart
} from '../../shared/nativeLive'
import { reportHelperExit } from '../errorReport/mainErrors'

// O processo do helper concord-live de uma live: manda os comandos (um JSON
// por linha no stdin) e entrega os eventos validados. stdin aberto até o fim:
// se a Salinha morrer, o pipe fecha e o helper para a live e sai sozinho.

/** O que usamos de um ChildProcess (o teste passa um falso). */
export interface LiveChild {
  stdin: Writable | null
  stdout: Readable | null
  on(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): unknown
  on(event: 'error', listener: (error: Error) => void): unknown
  kill(): boolean
}

export type SpawnLive = (path: string) => LiveChild

/** Depois do `stop`, quanto o helper tem para sair da sala antes do kill. */
export const STOP_GRACE_MS = 3000

/** Junta os pedaços do stdout em linhas inteiras (o pipe corta onde quiser). */
export class LineBuffer {
  private rest = ''

  push(chunk: string): string[] {
    const lines = (this.rest + chunk).split('\n')
    this.rest = lines.pop() ?? ''
    return lines.map((line) => line.trim()).filter(Boolean)
  }
}

export class LiveProcess {
  private child: LiveChild | null = null
  private ended = false
  private killTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly spawnLive: SpawnLive,
    private readonly onEvent: (event: NativeLiveEvent) => void,
    private readonly log: (message: string) => void = () => {}
  ) {}

  get running(): boolean {
    return this.child !== null
  }

  /** Abre o helper e manda o `start`; false = não abriu. */
  start(path: string, start: NativeLiveStart): boolean {
    if (this.child) return false
    let child: LiveChild
    try {
      child = this.spawnLive(path)
    } catch (error) {
      this.log(`helper não abriu: ${String(error)}`)
      return false
    }
    this.child = child
    this.ended = false
    this.watch(child)
    this.write({ cmd: 'start', ...start })
    return true
  }

  setQuality(quality: NativeLiveQuality): void {
    this.write({ cmd: 'quality', quality })
  }

  /** Pede para sair da sala; sem resposta em STOP_GRACE_MS, mata. */
  stop(): void {
    const child = this.child
    if (!child || this.killTimer) return
    this.write({ cmd: 'stop' })
    child.stdin?.end()
    this.killTimer = setTimeout(() => child.kill(), STOP_GRACE_MS)
  }

  private write(command: Record<string, unknown>): void {
    const stdin = this.child?.stdin
    if (!stdin || stdin.writableEnded) return
    stdin.write(`${JSON.stringify(command)}\n`)
  }

  private watch(child: LiveChild): void {
    const lines = new LineBuffer()
    child.stdout?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => {
      for (const line of lines.push(chunk)) this.handleLine(line)
    })
    // Pipe quebrado (helper morreu no meio de uma escrita) vira o exit abaixo.
    child.stdin?.on('error', () => {})
    child.on('error', (error) => {
      this.log(`helper: ${error.message}`)
      this.finish(child, null)
    })
    child.on('exit', (code, signal) => this.finish(child, code, signal))
  }

  private handleLine(line: string): void {
    const event = parseNativeLiveEvent(line)
    if (!event) return
    if (event.event === 'ended') this.ended = true
    this.onEvent(event)
  }

  /** O processo acabou: se não disse por quê, foi falha. */
  private finish(child: LiveChild, code: number | null, signal: NodeJS.Signals | null = null): void {
    if (this.child !== child) return
    this.child = null
    if (this.killTimer) clearTimeout(this.killTimer)
    this.killTimer = null
    if (this.ended) return
    this.ended = true
    this.log(`helper saiu sem avisar (código ${code})`)
    reportHelperExit('concord-live', code, signal)
    this.onEvent({ event: 'error', code: 'helper_failed', message: `saiu com código ${code}` })
    this.onEvent({ event: 'ended', reason: 'helper_exit' })
  }
}
