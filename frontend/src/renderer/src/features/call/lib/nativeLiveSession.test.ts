import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NativeLiveEvent, NativeLiveStart } from '../../../../../shared/nativeLive'
import { NativeLiveSession, type NativeLiveBridge, type NativeLiveDeps } from './nativeLiveSession'
import { takeScreenCodecChoice } from './screenCodecChoice'
import { takeLiveFailures, takeLiveStart } from './screenStartTelemetry'

const OUTBOUND = {
  id: 'OT1',
  type: 'outbound-rtp',
  kind: 'video',
  active: true,
  codecId: 'C1',
  mediaSourceId: 'S1',
  frameHeight: 1080,
  framesPerSecond: 30,
  bytesSent: 1000,
  qualityLimitationReason: 'none',
  encoderImplementation: 'VAAPI H264 Encoder',
  powerEfficientEncoder: true
}
const CODEC = { id: 'C1', type: 'codec', mimeType: 'video/H264' }

class FakeBridge implements NativeLiveBridge {
  started: NativeLiveStart[] = []
  qualities: NativeLiveStart['quality'][] = []
  stops = 0
  accept = true
  private listener: ((event: NativeLiveEvent) => void) | null = null

  async start(start: NativeLiveStart): Promise<boolean> {
    this.started.push(start)
    return this.accept
  }
  setQuality(quality: NativeLiveStart['quality']): void {
    this.qualities.push(quality)
  }
  stop(): void {
    this.stops++
  }
  onEvent(cb: (event: NativeLiveEvent) => void): () => void {
    this.listener = cb
    return () => (this.listener = null)
  }
  emit(event: NativeLiveEvent): void {
    this.listener?.(event)
  }
  get listening(): boolean {
    return this.listener !== null
  }
}

function setup(over: Partial<NativeLiveDeps> = {}) {
  const bridge = new FakeBridge()
  const deps: NativeLiveDeps = {
    bridge,
    url: 'wss://salinha.example',
    token: async () => ({ token: 'jwt', identity: 'eu:screen' }),
    simulcast: true,
    onView: vi.fn(),
    onEnded: vi.fn(),
    ...over
  }
  const session = new NativeLiveSession(deps, { resolution: '1080p', frameRate: 30 })
  return { bridge, deps, session }
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

async function startLive(over: Partial<NativeLiveDeps> = {}) {
  const ctx = setup(over)
  const started = ctx.session.start()
  await flush()
  ctx.bridge.emit({ event: 'capturing', width: 2560, height: 1440 })
  ctx.bridge.emit({ event: 'published', codec: 'h264', audio: false })
  expect(await started).toBe('started')
  return ctx
}

describe('NativeLiveSession', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] }))
  afterEach(() => vi.useRealTimers())

  it('pede o token, manda o degrau do preset e fica no ar ao publicar', async () => {
    const { bridge, session } = await startLive()
    expect(bridge.started[0]).toEqual({
      url: 'wss://salinha.example',
      token: 'jwt',
      quality: { width: 1920, height: 1080, fps: 30, maxBitrate: 4_500_000 },
      simulcast: true,
      audio: false
    })
    expect(session.identity).toBe('eu:screen')
    expect(session.live).toBe(true)
  })

  it('seletor fechado: cancelado (sem cair para o Chromium)', async () => {
    const { bridge, session } = setup()
    const started = session.start()
    await flush()
    bridge.emit({ event: 'error', code: 'capture_denied', message: '' })
    bridge.emit({ event: 'ended', reason: 'capture_denied' })
    expect(await started).toBe('cancelled')
    expect(bridge.listening).toBe(false)
  })

  it('falhou antes de publicar (sala, encoder, helper): failed', async () => {
    const { bridge, session } = setup()
    const started = session.start()
    await flush()
    bridge.emit({ event: 'error', code: 'connect_failed', message: 'x' })
    bridge.emit({ event: 'ended', reason: 'publish_failed' })
    expect(await started).toBe('failed')
  })

  it('sem token ou helper que não abre: failed', async () => {
    const noToken = setup({ token: () => Promise.reject(new Error('403')) })
    expect(await noToken.session.start()).toBe('failed')
    const closed = setup()
    closed.bridge.accept = false
    expect(await closed.session.start()).toBe('failed')
  })

  it('parar enquanto o seletor está aberto: cancelado', async () => {
    const { bridge, session } = setup()
    const started = session.start()
    await flush()
    session.stop()
    expect(await started).toBe('cancelled')
    expect(bridge.stops).toBe(1)
  })

  it('telemetria (ADR 0074): tempo até o ar, o motor e a fonte da live', async () => {
    takeLiveStart()
    takeScreenCodecChoice()
    const { bridge, session } = await startLive()
    expect(takeLiveStart()).not.toBeNull()
    expect(takeScreenCodecChoice()).toBeNull()
    bridge.emit({ event: 'stats', stats: [OUTBOUND, CODEC] })
    expect(takeScreenCodecChoice()).toBe('nativo: h264 placa')
    bridge.emit({ event: 'stats', stats: [OUTBOUND, CODEC] })
    expect(takeScreenCodecChoice()).toBeNull()
    expect(session.statsInput()?.source).toEqual({ width: 2560, height: 1440, surface: null })
  })

  it('telemetria: a live nativa que não começou anota o código do helper; desistir não', async () => {
    takeLiveFailures()
    const failed = setup()
    const started = failed.session.start()
    await flush()
    failed.bridge.emit({ event: 'error', code: 'connect_failed', message: 'x' })
    failed.bridge.emit({ event: 'ended', reason: 'publish_failed' })
    await started
    const denied = setup()
    const cancelled = denied.session.start()
    await flush()
    denied.bridge.emit({ event: 'error', code: 'capture_denied', message: '' })
    denied.bridge.emit({ event: 'ended', reason: 'capture_denied' })
    await cancelled
    expect(takeLiveFailures().map((e) => e.detail)).toEqual(['nativo · connect_failed'])
  })

  it('troca de degrau ao vivo cabe na fonte e vai ao helper', async () => {
    const { bridge, session } = await startLive()
    session.setQuality({ resolution: '720p', frameRate: 60 })
    expect(bridge.qualities.at(-1)).toEqual({ width: 1280, height: 720, fps: 60, maxBitrate: 4_500_000 })
  })

  it('estatísticas do helper viram o painel "Sua transmissão" e o codificador para o RPC', async () => {
    const { bridge, session } = await startLive()
    bridge.emit({ event: 'stats', stats: [OUTBOUND, CODEC] })
    const input = session.statsInput()
    expect(input).toMatchObject({ local: true, enabled: true, requestedFps: 30 })
    expect(input?.report.get('OT1')).toMatchObject(OUTBOUND)
    expect(session.encoderInfo()).not.toBeNull()
  })

  it('regressão: o tempo das estatísticas é o da chegada em ms (o helper manda µs)', async () => {
    const { bridge, session } = await startLive()
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_764_000_000_000)
    bridge.emit({ event: 'stats', stats: [{ ...OUTBOUND, timestamp: 1_764_000_000_000_000 }, CODEC] })
    const first = session.statsInput()?.report.get('OT1') as { timestamp: number }
    now.mockReturnValue(1_764_000_002_000)
    bridge.emit({ event: 'stats', stats: [{ ...OUTBOUND, timestamp: 1_764_000_002_000_000 }, CODEC] })
    const second = session.statsInput()?.report.get('OT1') as { timestamp: number }
    now.mockRestore()
    expect(first.timestamp).toBe(1_764_000_000_000)
    expect(second.timestamp - first.timestamp).toBe(2000)
  })

  it('o controlador de degraus lê o helper e manda o degrau de baixo', async () => {
    // Sem a camada extra, 1080p30 desce para 720p30 com a banda limitada.
    const { bridge, deps } = await startLive({ simulcast: false })
    expect(deps.onView).toHaveBeenCalledWith(expect.objectContaining({ step: 0 }))
    const limited = { ...OUTBOUND, qualityLimitationReason: 'bandwidth', targetBitrate: 500_000 }
    bridge.emit({ event: 'stats', stats: [limited, CODEC] })
    for (let i = 0; i < 10 && bridge.qualities.length === 0; i++) {
      await vi.advanceTimersByTimeAsync(2000)
    }
    expect(bridge.qualities.at(-1)).toMatchObject({ height: 720, fps: 30 })
  })

  it('acabou por falha depois de começar: avisa para cair no Chromium', async () => {
    const { bridge, deps } = await startLive()
    bridge.emit({ event: 'ended', reason: 'disconnected' })
    expect(deps.onEnded).toHaveBeenCalledWith(true)
    expect(deps.onView).toHaveBeenLastCalledWith(null)
  })

  it('a pessoa parou pelo sistema (fonte fechada): fim sem falha', async () => {
    const { bridge, deps, session } = await startLive()
    bridge.emit({ event: 'ended', reason: 'capture_ended' })
    expect(deps.onEnded).toHaveBeenCalledWith(false)
    expect(session.statsInput()).toBeNull()
  })

  it('parar pelo app não avisa fim (quem parou já sabe)', async () => {
    const { bridge, deps, session } = await startLive()
    session.stop()
    bridge.emit({ event: 'ended', reason: 'stopped' })
    expect(bridge.stops).toBe(1)
    expect(deps.onEnded).not.toHaveBeenCalled()
  })
})
