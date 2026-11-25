import { describe, expect, it, vi } from 'vitest'

vi.mock('livekit-client', () => ({
  Track: { Source: { Microphone: 'microphone', Camera: 'camera' } }
}))

import { readCallReport, type CallStatsRoom } from './callStatsReport'

const mine = new Map([['a', { type: 'outbound-rtp' }]]) as unknown as RTCStatsReport
const theirs = new Map([['b', { type: 'inbound-rtp' }]]) as unknown as RTCStatsReport

const track = (report: RTCStatsReport | undefined) => ({
  track: { getRTCStatsReport: async () => report }
})

function room(local?: RTCStatsReport, remote: (RTCStatsReport | undefined)[] = []): CallStatsRoom {
  return {
    localParticipant: { getTrackPublication: () => (local ? track(local) : undefined) },
    remoteParticipants: new Map(
      remote.map((r, i) => [String(i), { getTrackPublication: () => (r ? track(r) : undefined) }])
    )
  }
}

const ids = (report: RTCStatsReport | null): string[] => (report ? [...report.keys()] : [])

describe('readCallReport', () => {
  it('junta o meu microfone e a voz de cada pessoa (o que eu ouço)', async () => {
    expect(ids(await readCallReport(room(mine, [theirs])))).toEqual(['a', 'b'])
  })
  it('só ouvindo: a voz de quem fala', async () => {
    expect(ids(await readCallReport(room(undefined, [undefined, theirs])))).toEqual(['b'])
  })
  it('ninguém com microfone: null', async () => {
    expect(await readCallReport(room())).toBeNull()
  })
  it('câmeras também (a minha e as que recebo), no mesmo relatório (ADR 0074)', async () => {
    const cam = new Map([
      ['c', { type: 'outbound-rtp', kind: 'video' }]
    ]) as unknown as RTCStatsReport
    const theirCam = new Map([
      ['d', { type: 'inbound-rtp', kind: 'video' }]
    ]) as unknown as RTCStatsReport
    const bySource = (pubs: Record<string, RTCStatsReport>) => ({
      getTrackPublication: (source: string) => (pubs[source] ? track(pubs[source]) : undefined)
    })
    const r: CallStatsRoom = {
      localParticipant: bySource({ microphone: mine, camera: cam }),
      remoteParticipants: new Map([['bia', bySource({ microphone: theirs, camera: theirCam })]])
    }
    expect(ids(await readCallReport(r)).sort()).toEqual(['a', 'b', 'c', 'd'])
  })
  it('track removida no meio da leitura: junta as outras', async () => {
    const r = room(undefined, [theirs])
    r.localParticipant.getTrackPublication = () => ({
      track: {
        getRTCStatsReport: async () => {
          throw new Error('removida')
        }
      }
    })
    expect(ids(await readCallReport(r))).toEqual(['b'])
  })
})
