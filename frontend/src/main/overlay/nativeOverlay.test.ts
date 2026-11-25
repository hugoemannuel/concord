import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChildProcess } from 'node:child_process'
import type { OverlaySnapshot } from '../../renderer/src/features/overlay/lib/overlayState'
import { createNativeOverlay, NATIVE_READY_TIMEOUT_MS } from './nativeOverlay'
import { NATIVE_HIDDEN_LINE } from './nativeOverlayProtocol'
import type { OverlayHost } from './overlaySurface'
import { mainErrors } from '../errorReport/mainErrors'

class FakeChild extends EventEmitter {
  stdin = new PassThrough()
  stdout = new PassThrough()
  stderr = new PassThrough()
  killed = false
  written: string[] = []
  constructor() {
    super()
    this.stdin.setEncoding('utf8')
    this.stdin.on('data', (chunk: string) => this.written.push(...chunk.split('\n').filter(Boolean)))
  }
  kill(): boolean {
    this.killed = true
    return true
  }
  say(line: string): void {
    this.stdout.write(line + '\n')
  }
}

const snapshot: OverlaySnapshot = {
  enabled: true,
  inCall: true,
  members: [
    {
      id: 'eu',
      name: 'Nico',
      initial: 'N',
      avatarUrl: 'http://srv/api/profile-media/1',
      avatarAnimatedUrl: null,
      self: true,
      muted: false,
      deafened: false,
      speaking: false,
      watchingMe: false
    }
  ],
  more: 0,
  viewers: null,
  opacity: 30,
  layout: { position: null, scale: 1 },
  shortcut: 'Shift+Tab'
}
const game = { pid: 4242, monitor: { x: 0, y: 0, width: 1920, height: 1080 } }

let child: FakeChild
let host: OverlayHost & { failed: ReturnType<typeof vi.fn>; saveLayout: ReturnType<typeof vi.fn> }
let avatarListener: (() => void) | null
let avatarFile: string | undefined
const log = vi.fn()

function make(): ReturnType<typeof createNativeOverlay> {
  return createNativeOverlay(host, {
    start: () => child as unknown as ChildProcess,
    avatars: {
      path: () => avatarFile,
      onChange: (fn) => {
        avatarListener = fn
      }
    },
    log
  })
}

const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve))
const lines = (): Record<string, unknown>[] => child.written.map((l) => JSON.parse(l))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  child = new FakeChild()
  avatarListener = null
  avatarFile = undefined
  log.mockReset()
  host = {
    snapshot: () => snapshot,
    editing: () => false,
    stopEditing: vi.fn(),
    saveLayout: vi.fn(),
    lost: vi.fn(),
    failed: vi.fn()
  }
})

afterEach(() => {
  vi.useRealTimers()
})

describe('overlay nativo', () => {
  it('mostra mandando o estado; repetido não reenvia; esconder manda a linha curta', async () => {
    const surface = make()
    surface.show(game)
    surface.show(game)
    surface.hide()
    surface.hide()
    await tick()
    expect(lines()).toHaveLength(2)
    expect(lines()[0]).toMatchObject({ type: 'state', visible: true, game: 4242 })
    expect(child.written[1]).toBe(NATIVE_HIDDEN_LINE)
  })

  it('edição só depois do "ready"; o modo vai no estado', async () => {
    const surface = make()
    expect(surface.canEdit()).toBe(false)
    child.say('{"type":"ready"}')
    await tick()
    expect(surface.canEdit()).toBe(true)
    surface.show(game)
    surface.setEditing(true)
    await tick()
    expect(lines().at(-1)).toMatchObject({ editing: true })
  })

  it('posição nova do arraste vai para o renderer principal salvar', async () => {
    make()
    child.say('{"type":"layout","layout":{"position":{"x":0.5,"y":0.25},"scale":1.2}}')
    child.say('lixo')
    await tick()
    expect(host.saveLayout).toHaveBeenCalledWith({ position: { x: 0.5, y: 0.25 }, scale: 1.2 })
    expect(host.saveLayout).toHaveBeenCalledTimes(1)
  })

  it('avatar baixado depois manda o caminho', async () => {
    const surface = make()
    surface.show(game)
    expect(lines()[0]).toMatchObject({ members: [{ avatar: null }] })
    avatarFile = 'C:\\cache\\1'
    avatarListener?.()
    await tick()
    expect(lines().at(-1)).toMatchObject({ members: [{ avatar: 'C:\\cache\\1' }] })
  })

  it('helper que não responde a tempo: falha (o controlador cai no Electron)', () => {
    make()
    vi.advanceTimersByTime(NATIVE_READY_TIMEOUT_MS)
    expect(host.failed).toHaveBeenCalledWith('o helper não respondeu')
    expect(child.killed).toBe(true)
    expect(avatarListener).toBeNull()
  })

  it('helper que sai ou não inicia: falha uma vez só', async () => {
    make()
    child.say('{"type":"ready"}')
    await tick()
    child.emit('exit', 2)
    child.emit('error', new Error('ENOENT'))
    vi.advanceTimersByTime(NATIVE_READY_TIMEOUT_MS)
    expect(host.failed).toHaveBeenCalledTimes(1)
    expect(host.failed).toHaveBeenCalledWith('saiu (código 2)')
    // Saída que ninguém pediu vai para o relatório de erros.
    expect(mainErrors.take()).toMatchObject([{ kind: 'helper-exit', message: 'concord-overlay saiu sem avisar (código 2)' }])
  })

  it('destruir fecha o helper sem chamar de falha', () => {
    const surface = make()
    surface.destroy()
    child.emit('exit', 0)
    vi.advanceTimersByTime(NATIVE_READY_TIMEOUT_MS)
    expect(child.killed).toBe(true)
    expect(host.failed).not.toHaveBeenCalled()
    expect(mainErrors.take()).toEqual([])
    expect(surface.canEdit()).toBe(false)
    surface.show(game)
    expect(child.written).toEqual([])
  })

  it('stderr e erros do helper vão para o log', async () => {
    make()
    child.stderr.write('aviso\n')
    child.say('{"type":"error","message":"avatar x: falhou"}')
    await tick()
    expect(log).toHaveBeenCalledWith('overlay nativo: aviso')
    expect(log).toHaveBeenCalledWith('overlay nativo: avatar x: falhou')
  })
})
