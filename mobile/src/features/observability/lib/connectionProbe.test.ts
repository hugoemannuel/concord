import { ApiError } from '../../../shared/api/client'
import type { CallMedia, MediaConnection } from '../../call/lib/callMedia'
import type { CallPhase } from '../../call/lib/callTypes'
import { createCallEventLog } from './callEventLog'
import { createConnectionProbe } from './connectionProbe'

function fakeMedia(connect: () => Promise<void>) {
  const listeners: ((s: MediaConnection) => void)[] = []
  const media = {
    connect: jest.fn(connect),
    onConnection: jest.fn((l: (s: MediaConnection) => void) => {
      listeners.push(l)
      return () => {}
    })
  } as unknown as CallMedia
  return { media, emit: (s: MediaConnection) => listeners.forEach((l) => l(s)) }
}

function setup(phase: CallPhase = 'connecting') {
  const log = createCallEventLog(() => 0)
  let current = phase
  const probe = createConnectionProbe(log, () => current)
  return { log, probe, setPhase: (p: CallPhase) => (current = p) }
}

describe('createConnectionProbe: API', () => {
  it('rede ou servidor fora ao pedir acesso: falhou na etapa acesso', async () => {
    const { log, probe } = setup()
    const api = probe.api({ startCall: jest.fn().mockRejectedValue(new ApiError(0, 'Request timed out')), getCallToken: jest.fn().mockRejectedValue(new ApiError(502, 'x')) })
    await expect(api.startCall({ type: 'channel', channel_id: 'c' })).rejects.toThrow('Request timed out')
    await expect(api.getCallToken('c1')).rejects.toBeInstanceOf(ApiError)
    expect(log.take()).toEqual([
      { type: 'conexao_falhou', detail: 'entrando (acesso): Request timed out' },
      { type: 'conexao_falhou', detail: 'entrando (acesso): HTTP 502' }
    ])
  })

  it('recusa do servidor (sala trancada, sem permissão) não é falha de conexão', async () => {
    const { log, probe } = setup()
    const api = probe.api({ startCall: jest.fn().mockRejectedValue(new ApiError(423, 'trancada')), getCallToken: jest.fn().mockResolvedValue({ token: 't' }) })
    await expect(api.startCall({ type: 'channel', channel_id: 'c' })).rejects.toThrow()
    expect(await api.getCallToken('c1')).toEqual({ token: 't' })
    expect(log.take()).toEqual([])
  })

  it('erro de rede do fetch (TypeError) também é falha de acesso', async () => {
    const { log, probe } = setup()
    const api = probe.api({ startCall: jest.fn(), getCallToken: jest.fn().mockRejectedValue(new TypeError('Network request failed')) })
    await expect(api.getCallToken('c1')).rejects.toThrow()
    expect(log.take()).toEqual([{ type: 'conexao_falhou', detail: 'entrando (acesso): Network request failed' }])
  })
})

describe('createConnectionProbe: mídia', () => {
  it('o LiveKit não conectou: falhou na etapa voz, sem o endereço do servidor', async () => {
    const { log, probe } = setup()
    const { media } = fakeMedia(() => Promise.reject(new Error('could not establish signal connection: wss://voz.exemplo/rtc?access_token=abc')))
    await expect(probe.media(media).connect('wss://x', 't')).rejects.toThrow()
    expect(log.take()).toEqual([{ type: 'conexao_falhou', detail: 'entrando (voz): could not establish signal connection: …' }])
  })

  it('a voz caiu no meio da call (conectada ou reconectando)', () => {
    const { log, probe, setPhase } = setup('active')
    const { media, emit } = fakeMedia(() => Promise.resolve())
    probe.media(media)
    emit('disconnected')
    setPhase('reconnecting')
    emit('disconnected')
    expect(log.take()).toEqual([
      { type: 'conexao_falhou', detail: 'conectada: caiu' },
      { type: 'conexao_falhou', detail: 'reconectando: caiu' }
    ])
  })

  it('sair por vontade própria, outro aparelho ou reconectar não é queda', async () => {
    const { log, probe, setPhase } = setup('active')
    const { media, emit } = fakeMedia(() => Promise.resolve())
    const probed = probe.media(media)
    await probed.connect('wss://x', 't')
    emit('reconnecting')
    emit('replaced')
    setPhase('idle')
    emit('disconnected')
    expect(log.take()).toEqual([])
  })
})
