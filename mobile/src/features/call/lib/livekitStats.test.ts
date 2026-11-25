import type { Room } from 'livekit-client'
import { createLiveKitStats } from './livekitStats'

jest.mock('livekit-client', () => ({ Track: { Source: { ScreenShare: 'screen_share', Microphone: 'microphone' } } }))
jest.mock('@livekit/react-native', () => ({ AudioSession: { getAudioOutputs: jest.fn().mockResolvedValue(['speaker', 'bluetooth']) } }))

const stats = (id: string) => new Map([[id, { type: 'outbound-rtp' }]])

function room(opts: { local?: object; remote?: object }): Room {
  const publication = (pub?: object) => ({ getTrackPublication: (source: string) => (source === 'screen_share' ? pub : undefined) })
  return {
    localParticipant: publication(opts.local),
    remoteParticipants: new Map([['bia', publication(opts.remote)]])
  } as unknown as Room
}

describe('createLiveKitStats', () => {
  it('a minha tela: o relatório e o fps pedido na publicação', async () => {
    const videoTrack = { getRTCStatsReport: async () => stats('o'), publishOptions: { screenShareEncoding: { maxFramerate: 15 } } }
    const input = await createLiveKitStats(room({ local: { videoTrack } })).readScreen('eu', true)
    expect(input).toMatchObject({ streamState: 'active', requestedFps: 15 })
    expect(input?.report.get('o')).toEqual({ type: 'outbound-rtp' })
  })

  it('sem tela publicada: null; leitura que falha vira relatório vazio, fps padrão vira null', async () => {
    expect(await createLiveKitStats(room({})).readScreen('eu', true)).toBeNull()
    const videoTrack = { getRTCStatsReport: async () => Promise.reject(new Error('fechou')) }
    const input = await createLiveKitStats(room({ local: { videoTrack } })).readScreen('eu', true)
    expect(input).toMatchObject({ requestedFps: null })
    expect(input?.report.get('o')).toBeUndefined()
  })

  it('a tela de outra pessoa: o relatório e se o servidor pausou', async () => {
    const track = { getRTCStatsReport: async () => stats('i'), streamState: 'paused' }
    const reader = createLiveKitStats(room({ remote: { track } }))
    expect(await reader.readScreen('bia', false)).toMatchObject({ streamState: 'paused', requestedFps: null })
    expect(await reader.readScreen('caio', false)).toBeNull()
    expect(await createLiveKitStats(room({ remote: {} })).readScreen('bia', false)).toBeNull()
  })

  it('as saídas de áudio do aparelho e a voz (sem microfone: null)', async () => {
    const reader = createLiveKitStats(room({}))
    expect(await reader.readAudioOutputs()).toEqual(['speaker', 'bluetooth'])
    expect(await reader.readCall()).toBeNull()
  })
})
