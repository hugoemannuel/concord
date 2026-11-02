import { describe, expect, it, vi } from 'vitest'

vi.mock('livekit-client', () => ({
  Track: { Source: { ScreenShare: 'screen_share' } }
}))

import {
  clearActiveScreenStats,
  readActiveCallStats,
  readActiveScreenStats,
  readScreenStatsInput,
  setActiveScreenStats,
  type StatsRoomLike
} from './screenStatsSource'

const report = new Map([['o1', { type: 'outbound-rtp' }]]) as unknown as RTCStatsReport

function room(parts: {
  local?: ReturnType<StatsRoomLike['localParticipant']['getTrackPublication']>
  remote?: Record<
    string,
    ReturnType<
      NonNullable<ReturnType<StatsRoomLike['remoteParticipants']['get']>>['getTrackPublication']
    >
  >
}): StatsRoomLike {
  return {
    localParticipant: { getTrackPublication: () => parts.local },
    remoteParticipants: new Map(
      Object.entries(parts.remote ?? {}).map(([id, pub]) => [
        id,
        { getTrackPublication: () => pub }
      ])
    )
  }
}

describe('readScreenStatsInput', () => {
  it('minha live: relatório do envio e o fps pedido na publicação', async () => {
    const input = await readScreenStatsInput(
      room({
        local: {
          videoTrack: {
            getRTCStatsReport: async () => report,
            publishOptions: { screenShareEncoding: { maxFramerate: 60 } }
          }
        }
      }),
      'eu',
      true
    )
    expect(input).toEqual({
      local: true,
      report,
      enabled: true,
      streamState: 'active',
      requestedFps: 60,
      codecFallback: null
    })
  })

  it('codec de reserva ativo: junta o envio do sender de reserva (VP8) ao do principal', async () => {
    // Regressão: com o VP8 de reserva publicando, o vídeo sai por outro sender
    // (simulcastCodecs) e o painel só lia o principal, pausado → "Ainda sem dados".
    const principal = new Map([
      ['o1', { id: 'o1', type: 'outbound-rtp', kind: 'video', active: false }]
    ]) as unknown as RTCStatsReport
    const reserva = new Map([
      ['o2', { id: 'o2', type: 'outbound-rtp', kind: 'video', active: true }]
    ]) as unknown as RTCStatsReport
    const input = await readScreenStatsInput(
      room({
        local: {
          videoTrack: {
            getRTCStatsReport: async () => principal,
            simulcastCodecs: new Map([['vp8', { sender: { getStats: async () => reserva } }]])
          }
        }
      }),
      'eu',
      true
    )
    const ids: string[] = []
    input?.report.forEach((stat: { id: string }) => ids.push(stat.id))
    expect(ids.sort()).toEqual(['o1', 'o2'])
  })

  it('sem live publicada: null', async () => {
    expect(await readScreenStatsInput(room({}), 'eu', true)).toBeNull()
    expect(await readScreenStatsInput(room({}), 'bia', false)).toBeNull()
  })

  it('live de outra pessoa: recepção, desligada por mim e pausa do servidor', async () => {
    const input = await readScreenStatsInput(
      room({
        remote: {
          bia: {
            isEnabled: false,
            track: { getRTCStatsReport: async () => report, streamState: 'paused' }
          }
        }
      }),
      'bia',
      false
    )
    expect(input).toMatchObject({
      local: false,
      report,
      enabled: false,
      streamState: 'paused',
      driverHint: null
    })
  })

  it('live da bia pelo helper nativo (bia:screen): lê a recepção dele', async () => {
    const input = await readScreenStatsInput(
      room({
        remote: {
          bia: undefined,
          'bia:screen': {
            isEnabled: true,
            track: { getRTCStatsReport: async () => report, streamState: 'active' }
          }
        }
      }),
      'bia',
      false
    )
    expect(input).toMatchObject({ local: false, report, enabled: true })
  })

  it('ainda não assinada: relatório vazio', async () => {
    const input = await readScreenStatsInput(
      room({ remote: { bia: { isEnabled: true } } }),
      'bia',
      false
    )
    expect(input?.report.size).toBe(0)
    expect(input?.streamState).toBe('active')
  })
})

describe('chamada ativa', () => {
  it('lê da chamada registrada; depois de sair, nada', async () => {
    const reader = { readScreenStats: vi.fn(async () => null) }
    setActiveScreenStats(reader)
    await readActiveScreenStats('bia', false)
    expect(reader.readScreenStats).toHaveBeenCalledWith('bia', false)
    const other = { readScreenStats: vi.fn(async () => null) }
    clearActiveScreenStats(other)
    clearActiveScreenStats(reader)
    expect(await readActiveScreenStats('bia', false)).toBeNull()
    expect(reader.readScreenStats).toHaveBeenCalledTimes(1)
  })
})

describe('voz da chamada ativa (telemetria)', () => {
  it('lê o getStats() da voz da chamada registrada; sem chamada, null', async () => {
    const voice = new Map([['t', { type: 'transport' }]]) as unknown as RTCStatsReport
    const reader = {
      readScreenStats: vi.fn(async () => null),
      readCallStats: vi.fn(async () => voice)
    }
    setActiveScreenStats(reader)
    expect(await readActiveCallStats()).toBe(voice)
    clearActiveScreenStats(reader)
    expect(await readActiveCallStats()).toBeNull()
  })
})
