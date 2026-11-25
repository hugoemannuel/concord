import { readCallReport, type CallStatsRoom } from './callStatsReport'

const participant = (stats: Record<string, unknown> | null | 'throws') => ({
  getTrackPublication: jest.fn((source: string) =>
    source === 'microphone'
      ? {
          track: {
            getRTCStatsReport: async () => {
              if (stats === 'throws') throw new Error('removida')
              return stats ? new Map(Object.entries(stats)) : undefined
            }
          }
        }
      : undefined
  )
})

describe('readCallReport', () => {
  it('junta o meu microfone e a voz de cada pessoa num relatório só', async () => {
    const room = {
      localParticipant: participant({ out: { type: 'outbound-rtp' } }),
      remoteParticipants: new Map([
        ['u2', participant({ in2: { type: 'inbound-rtp' } })],
        ['u3', participant('throws')]
      ])
    } as unknown as CallStatsRoom
    const report = await readCallReport(room)
    expect(report?.get('out')).toEqual({ type: 'outbound-rtp' })
    expect(report?.get('in2')).toEqual({ type: 'inbound-rtp' })
  })

  it('sem nenhuma voz publicada: null', async () => {
    const room = { localParticipant: participant(null), remoteParticipants: new Map() } as unknown as CallStatsRoom
    expect(await readCallReport(room)).toBeNull()
  })
})
