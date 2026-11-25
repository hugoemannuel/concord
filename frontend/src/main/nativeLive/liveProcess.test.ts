import { EventEmitter } from 'events'
import { PassThrough } from 'stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NativeLiveEvent, NativeLiveStart } from '../../shared/nativeLive'
import { LineBuffer, LiveProcess, STOP_GRACE_MS, type LiveChild } from './liveProcess'
import { mainErrors } from '../errorReport/mainErrors'

const START: NativeLiveStart = {
  url: 'wss://salinha.example',
  token: 'jwt',
  quality: { width: 1920, height: 1080, fps: 30, maxBitrate: 4_500_000 },
  simulcast: true,
  audio: false
}

/** Helper falso: o que foi escrito no stdin e um stdout para "responder". */
class FakeChild extends EventEmitter implements LiveChild {
  stdin = new PassThrough()
  stdout = new PassThrough()
  written: string[] = []
  kill = vi.fn(() => true)

  constructor() {
    super()
    this.stdin.setEncoding('utf8')
    this.stdin.on('data', (chunk: string) => this.written.push(...chunk.trim().split('\n')))
  }

  say(line: string): void {
    this.stdout.write(line)
  }

  commands(): Record<string, unknown>[] {
    return this.written.map((line) => JSON.parse(line))
  }
}

function setup(): { child: FakeChild; events: NativeLiveEvent[]; live: LiveProcess } {
  const child = new FakeChild()
  const events: NativeLiveEvent[] = []
  const live = new LiveProcess(
    () => child,
    (event) => events.push(event)
  )
  return { child, events, live }
}

const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve))

describe('LineBuffer', () => {
  it('junta pedaços em linhas inteiras', () => {
    const lines = new LineBuffer()
    expect(lines.push('{"a":1}\n{"b"')).toEqual(['{"a":1}'])
    expect(lines.push(':2}\r\n\n')).toEqual(['{"b":2}'])
  })
})

describe('LiveProcess', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }))
  afterEach(() => vi.useRealTimers())

  it('manda o start e repassa os eventos válidos', async () => {
    const { child, events, live } = setup()
    expect(live.start('/helper', START)).toBe(true)
    await flush()
    expect(child.commands()[0]).toEqual({ cmd: 'start', ...START })

    child.say('{"event":"capturing","width":1920,"height":1080}\nlixo\n{"event":"publi')
    child.say('shed","codec":"h264","audio":false}\n')
    await flush()
    expect(events).toEqual([
      { event: 'capturing', width: 1920, height: 1080 },
      { event: 'published', codec: 'h264', audio: false }
    ])
  })

  it('troca de degrau vai como comando quality', async () => {
    const { child, live } = setup()
    live.start('/helper', START)
    live.setQuality({ width: 1280, height: 720, fps: 30, maxBitrate: 3_000_000 })
    await flush()
    expect(child.commands()[1]).toEqual({
      cmd: 'quality',
      quality: { width: 1280, height: 720, fps: 30, maxBitrate: 3_000_000 }
    })
  })

  it('uma live por vez', () => {
    const { live } = setup()
    expect(live.start('/helper', START)).toBe(true)
    expect(live.start('/helper', START)).toBe(false)
  })

  it('não abriu: false e sem eventos', () => {
    const events: NativeLiveEvent[] = []
    const live = new LiveProcess(
      () => {
        throw new Error('ENOENT')
      },
      (event) => events.push(event)
    )
    expect(live.start('/nao-existe', START)).toBe(false)
    expect(live.running).toBe(false)
    expect(events).toEqual([])
  })

  it('stop pede para sair e mata se o helper não sair a tempo', async () => {
    const { child, live } = setup()
    live.start('/helper', START)
    live.stop()
    await flush()
    expect(child.commands().at(-1)).toEqual({ cmd: 'stop' })
    expect(child.kill).not.toHaveBeenCalled()
    vi.advanceTimersByTime(STOP_GRACE_MS)
    expect(child.kill).toHaveBeenCalled()
  })

  it('saiu depois do ended: nada a mais', async () => {
    const { child, events, live } = setup()
    live.start('/helper', START)
    child.say('{"event":"ended","reason":"stopped"}\n')
    await flush()
    child.emit('exit', 0)
    expect(events).toEqual([{ event: 'ended', reason: 'stopped' }])
    expect(live.running).toBe(false)
    expect(mainErrors.take()).toEqual([])
  })

  it('morreu sem avisar: erro e fim (o renderer volta para a live do Chromium)', () => {
    const { child, events, live } = setup()
    live.start('/helper', START)
    child.emit('exit', 134)
    expect(events).toEqual([
      { event: 'error', code: 'helper_failed', message: 'saiu com código 134' },
      { event: 'ended', reason: 'helper_exit' }
    ])
    // Já acabou: outro exit/erro do mesmo processo não repete.
    child.emit('error', new Error('x'))
    expect(events).toHaveLength(2)
    // Saída que ninguém pediu vai para o relatório de erros, uma vez.
    expect(mainErrors.take()).toMatchObject([{ message: 'concord-live saiu sem avisar (código 134)', count: 1 }])
  })

  it('morto por não parar a tempo depois do stop: não vai para o relatório de erros', () => {
    const { child, live } = setup()
    live.start('/helper', START)
    live.stop()
    vi.advanceTimersByTime(STOP_GRACE_MS)
    child.emit('exit', null, 'SIGTERM')
    expect(live.running).toBe(false)
    expect(mainErrors.take()).toEqual([])
  })

  it('depois de acabar, abre outra live', () => {
    const { child, live } = setup()
    live.start('/helper', START)
    child.emit('exit', 0)
    expect(live.start('/helper', START)).toBe(true)
  })
})
