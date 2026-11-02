import { Track, type LocalParticipant } from 'livekit-client'

// Microfone da chamada na sala do LiveKit: publica, muta e troca o
// dispositivo. A track é do store (ele a cria e para); a sala recebe uma cópia.
// Quando o servidor tira a permissão de falar ("silenciar no servidor"), o
// LiveKit despublica o microfone e o SDK para a track publicada: se fosse a do
// store, ao liberar a pessoa voltaria a publicar uma track morta, em silêncio.

/** Voz a 64 kbps mono, como o Discord (o padrão do SDK é ~32 kbps). DTX e RED vêm da sala. */
export const MIC_AUDIO_PRESET = { maxBitrate: 64_000 }

/**
 * Stream só da voz. A sala sincroniza faixas do mesmo stream (SyncStreams, no
 * token do backend) para o vídeo da live andar junto com o som dela; o padrão
 * do LiveKit junta microfone e câmera em "camera", e a voz passaria a esperar
 * pelo vídeo da câmera (mais atraso na conversa).
 */
export const MIC_STREAM = 'voz'

export class MicPublisher {
  /** Microfone da chamada, guardado para publicar quando a permissão de falar chegar. */
  private track: MediaStreamTrack | null = null

  constructor(private readonly participant: () => LocalParticipant) {}

  /** Guarda o microfone (publicado agora ou quando ensure() puder). */
  setTrack(track: MediaStreamTrack): void {
    this.track = track
  }

  async publish(muted: boolean): Promise<void> {
    if (!this.track) return
    const publication = await this.participant().publishTrack(this.track.clone(), {
      source: Track.Source.Microphone,
      name: 'microphone',
      stream: MIC_STREAM,
      audioPreset: MIC_AUDIO_PRESET
    })
    if (muted) await publication.mute()
  }

  /** Publica o microfone se ainda não está publicado. */
  async ensure(muted: boolean): Promise<void> {
    if (!this.track) return
    if (this.participant().getTrackPublication(Track.Source.Microphone)) return
    await this.publish(muted)
  }

  async setMuted(muted: boolean): Promise<void> {
    const publication = this.participant().getTrackPublication(Track.Source.Microphone)
    if (!publication) return
    if (muted) await publication.mute()
    else await publication.unmute()
  }

  /** Troca o microfone publicado (outro dispositivo) sem sair da sala. */
  async replace(track: MediaStreamTrack): Promise<void> {
    this.track = track
    const publication = this.participant().getTrackPublication(Track.Source.Microphone)
    if (!publication?.track) return
    const sent = publication.track.mediaStreamTrack
    // userProvidedTrack: o SDK não para nem recria a track; a cópia antiga é nossa.
    await publication.track.replaceTrack(track.clone(), true)
    sent.stop()
  }
}
