import { describe, expect, it, vi } from 'vitest'

vi.mock('livekit-client', () => ({ Track: { Source: { Microphone: 'microphone' } } }))

import type { LocalParticipant } from 'livekit-client'
import { MicPublisher } from './micPublisher'

// Track falsa com o ciclo de vida que importa: stop() a encerra para sempre.
class FakeTrack {
  readyState: 'live' | 'ended' = 'live'
  enabled = true
  stop(): void {
    this.readyState = 'ended'
  }
  clone(): FakeTrack {
    const copy = new FakeTrack()
    copy.enabled = this.enabled
    return copy
  }
}

interface FakePublication {
  track: { mediaStreamTrack: FakeTrack; replaceTrack: ReturnType<typeof vi.fn> }
  mute: ReturnType<typeof vi.fn>
  unmute: ReturnType<typeof vi.fn>
}

/** Participante local com o que o SDK faz ao publicar e ao o servidor despublicar. */
function fakeParticipant(): {
  participant: LocalParticipant
  published: () => FakeTrack | undefined
  serverUnpublish: () => void
} {
  let publication: FakePublication | undefined
  const participant = {
    publishTrack: vi.fn(async (track: FakeTrack) => {
      publication = {
        track: {
          mediaStreamTrack: track,
          replaceTrack: vi.fn(async (next: FakeTrack) => {
            publication!.track.mediaStreamTrack = next
          })
        },
        mute: vi.fn(async () => {}),
        unmute: vi.fn(async () => {})
      }
      return publication
    }),
    getTrackPublication: vi.fn(() => publication)
  }
  return {
    participant: participant as unknown as LocalParticipant,
    published: () => publication?.track.mediaStreamTrack,
    // Sem permissão de falar o LiveKit despublica o microfone e o SDK para a
    // track publicada (stopLocalTrackOnUnpublish).
    serverUnpublish: () => {
      publication?.track.mediaStreamTrack.stop()
      publication = undefined
    }
  }
}

const asTrack = (t: FakeTrack): MediaStreamTrack => t as unknown as MediaStreamTrack

describe('MicPublisher', () => {
  it('o servidor despublicar não mata o microfone do app: ao voltar a permissão, republica som vivo (#369)', async () => {
    const lk = fakeParticipant()
    const mic = new FakeTrack()
    const publisher = new MicPublisher(() => lk.participant)
    publisher.setTrack(asTrack(mic))
    await publisher.publish(false)

    lk.serverUnpublish()
    await publisher.ensure(false)

    expect(mic.readyState).toBe('live')
    expect(lk.published()?.readyState).toBe('live')
  })

  it('publica o microfone a 64 kbps, com DTX e RED da sala, também ao republicar', async () => {
    const lk = fakeParticipant()
    const publisher = new MicPublisher(() => lk.participant)
    publisher.setTrack(asTrack(new FakeTrack()))
    await publisher.publish(false)
    lk.serverUnpublish()
    await publisher.ensure(false)

    const publishTrack = vi.mocked(lk.participant.publishTrack)
    expect(publishTrack).toHaveBeenCalledTimes(2)
    for (const [, options] of publishTrack.mock.calls) {
      expect(options).toMatchObject({ audioPreset: { maxBitrate: 64_000 } })
      expect(options).not.toHaveProperty('dtx', false)
      expect(options).not.toHaveProperty('red', false)
    }
  })

  it('publica a voz num stream só dela: com a sincronia da sala a voz não espera o vídeo da câmera', async () => {
    const lk = fakeParticipant()
    const publisher = new MicPublisher(() => lk.participant)
    publisher.setTrack(asTrack(new FakeTrack()))
    await publisher.publish(false)

    const [, options] = vi.mocked(lk.participant.publishTrack).mock.calls[0]
    // O padrão do LiveKit junta microfone e câmera no stream "camera".
    expect(options).toMatchObject({ stream: 'voz' })
  })

  it('não publica duas vezes', async () => {
    const lk = fakeParticipant()
    const publisher = new MicPublisher(() => lk.participant)
    publisher.setTrack(asTrack(new FakeTrack()))
    await publisher.publish(false)
    await publisher.ensure(false)
    expect(lk.participant.publishTrack).toHaveBeenCalledTimes(1)
  })

  it('publica mutado quando pedido', async () => {
    const lk = fakeParticipant()
    const publisher = new MicPublisher(() => lk.participant)
    publisher.setTrack(asTrack(new FakeTrack()))
    await publisher.publish(true)
    const publication = lk.participant.getTrackPublication('microphone' as never) as never as FakePublication
    expect(publication.mute).toHaveBeenCalled()
  })

  it('sem microfone guardado não publica', async () => {
    const lk = fakeParticipant()
    await new MicPublisher(() => lk.participant).ensure(false)
    expect(lk.participant.publishTrack).not.toHaveBeenCalled()
  })

  it('trocar o dispositivo publica o novo e solta a cópia antiga sem parar o do app', async () => {
    const lk = fakeParticipant()
    const old = new FakeTrack()
    const next = new FakeTrack()
    const publisher = new MicPublisher(() => lk.participant)
    publisher.setTrack(asTrack(old))
    await publisher.publish(false)
    const sentBefore = lk.published()

    await publisher.replace(asTrack(next))

    expect(old.readyState).toBe('live')
    expect(sentBefore?.readyState).toBe('ended')
    expect(lk.published()?.readyState).toBe('live')
    // Republicar depois de uma despublicação usa o microfone novo.
    lk.serverUnpublish()
    await publisher.ensure(false)
    expect(next.readyState).toBe('live')
    expect(lk.published()?.readyState).toBe('live')
  })

  it('muta e desmuta a publicação; sem publicação não faz nada', async () => {
    const lk = fakeParticipant()
    const publisher = new MicPublisher(() => lk.participant)
    await publisher.setMuted(true)
    publisher.setTrack(asTrack(new FakeTrack()))
    await publisher.publish(false)
    const publication = lk.participant.getTrackPublication('microphone' as never) as never as FakePublication
    await publisher.setMuted(true)
    await publisher.setMuted(false)
    expect(publication.mute).toHaveBeenCalledTimes(1)
    expect(publication.unmute).toHaveBeenCalledTimes(1)
  })
})
