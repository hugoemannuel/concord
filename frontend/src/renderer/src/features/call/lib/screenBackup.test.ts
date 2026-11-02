import { describe, expect, it, vi } from 'vitest'
import { BACKUP_ENCODING, backupEncoding, syncBackupHint, tuneScreenBackup } from './screenBackup'

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- fixture de teste
function backupTrack(settings: MediaTrackSettings) {
  const clone = { contentHint: '', getSettings: () => settings }
  let parameters = {
    encodings: [{ maxBitrate: 7_000_000, maxFramerate: 60, active: true }]
  } as RTCRtpSendParameters
  const sender = {
    getParameters: () => structuredClone(parameters),
    setParameters: vi.fn(async (next: RTCRtpSendParameters) => {
      parameters = next
    })
  }
  const info = {
    mediaStreamTrack: clone,
    encodings: [{ maxBitrate: 7_000_000, maxFramerate: 60 }] as RTCRtpEncodingParameters[]
  }
  const original = vi.fn<(codec: string, sender: RTCRtpSender) => Promise<void>>(async () => {})
  const track = {
    mediaStreamTrack: { contentHint: 'motion' },
    simulcastCodecs: new Map([['h264', info]]),
    setSimulcastTrackSender: original
  }
  return { track, sender, info, clone, original, parameters: () => parameters }
}

describe('backupEncoding', () => {
  it('regressão: reserva H.264 de janela 2560×1438 sai com lados pares (ímpar = processador)', () => {
    const scale = backupEncoding({ width: 2560, height: 1438 }).scaleResolutionDownBy ?? 1
    expect([Math.trunc(2560 / scale) % 2, Math.trunc(1438 / scale) % 2]).toEqual([0, 0])
  })

  it('captura 1080p: reserva em 720p30 a 2,5 Mbps, com prioridade baixa na banda', () => {
    expect(backupEncoding({ width: 1920, height: 1080 })).toEqual({
      maxBitrate: 2_500_000,
      maxFramerate: 30,
      scaleResolutionDownBy: 1.5,
      priority: 'low',
      networkPriority: 'low'
    })
  })

  it('captura de 720p ou menor não amplia; sem tamanho, não reduz', () => {
    expect(backupEncoding({ width: 1280, height: 720 }).scaleResolutionDownBy).toBe(1)
    expect(backupEncoding({ width: 960, height: 540 }).scaleResolutionDownBy).toBe(1)
    expect(backupEncoding({}).scaleResolutionDownBy).toBe(1)
  })

  it('tela em pé (retrato): usa o lado menor, como a camada extra de 720p', () => {
    expect(backupEncoding({ width: 1440, height: 2560 }).scaleResolutionDownBy).toBe(2)
  })
})

describe('tuneScreenBackup', () => {
  it('quando o SDK cria o sender da reserva, troca o encoding inteiro da live pelo de 720p30', async () => {
    const { track, sender, info, original, parameters } = backupTrack({ width: 1920, height: 1080 })
    tuneScreenBackup(track as never)
    await track.setSimulcastTrackSender('h264', sender as never)
    expect(original).toHaveBeenCalledWith('h264', sender)
    expect(parameters().encodings[0]).toEqual({
      ...BACKUP_ENCODING,
      scaleResolutionDownBy: 1.5,
      priority: 'low',
      networkPriority: 'low',
      active: true
    })
    // O SDK compara o número de camadas e liga/desliga pelo `active`: guarda a mesma.
    expect(info.encodings).toEqual([parameters().encodings[0]])
  })

  it('a reserva segue a dica de conteúdo da live (jogo a 60 fps = motion)', async () => {
    const { track, sender, clone } = backupTrack({ width: 1920, height: 1080 })
    tuneScreenBackup(track as never)
    await track.setSimulcastTrackSender('h264', sender as never)
    expect(clone.contentHint).toBe('motion')
    track.mediaStreamTrack.contentHint = 'detail'
    syncBackupHint(track as never)
    expect(clone.contentHint).toBe('detail')
  })

  it('o navegador recusar o encoding não derruba a reserva', async () => {
    const { track, sender, original } = backupTrack({ width: 1920, height: 1080 })
    sender.setParameters.mockRejectedValueOnce(new Error('InvalidModificationError'))
    tuneScreenBackup(track as never)
    await expect(track.setSimulcastTrackSender('h264', sender as never)).resolves.toBeUndefined()
    expect(original).toHaveBeenCalled()
  })

  it('sender com mais de uma camada (não é o que o SDK cria para tela): não mexe', async () => {
    const { track, sender } = backupTrack({ width: 1920, height: 1080 })
    sender.getParameters = () =>
      ({ encodings: [{ rid: 'q' }, { rid: 'f' }] }) as unknown as RTCRtpSendParameters
    tuneScreenBackup(track as never)
    await track.setSimulcastTrackSender('h264', sender as never)
    expect(sender.setParameters).not.toHaveBeenCalled()
  })
})
