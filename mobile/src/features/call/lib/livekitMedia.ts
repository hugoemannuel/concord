import { AudioSession } from '@livekit/react-native'
import { ConnectionState, DisconnectReason, Room, RoomEvent, Track, type LocalVideoTrack, type RemoteParticipant, type RemoteTrackPublication, type VideoTrack } from 'livekit-client'
import type { CallMedia, MediaConnection } from './callMedia'
import { clearCameraTracks, setCameraTrack } from './livekitCamera'
import { createNativeTracks, releaseNativeTrack } from './releaseNativeTrack'
import { clearActiveCallStats, setActiveCallStats, type CallStatsReader } from './callStatsSource'
import { createLiveKitStats } from './livekitStats'
import { disableVideoStartBitrate } from './startBitrate'

// Os dois únicos arquivos do app que falam com o SDK do LiveKit (ADR 0023): este e livekitScreen.tsx (que só
// desenha a transmissão). Ficam fora da cobertura do Jest (módulo nativo): a lógica toda está no callController,
// testado com uma CallMedia falsa. Provado no aparelho (PR B); a transmissão de tela ainda não (ADR 0027).

// Volume de cada pessoa escolhido por mim (0 a 1); quem não está aqui fica em 1.
const userVolumes = new Map<string, number>()

/** Volume 0 silencia quem chega sem sair da sala: é o "fone" do painel do usuário. Com fone, vale o de cada pessoa. */
const setRemoteVolume = (room: Room, listening: boolean): void => {
  room.remoteParticipants.forEach((p) => p.setVolume(listening ? (userVolumes.get(p.identity) ?? 1) : 0))
}

const screenOf = (p: RemoteParticipant): RemoteTrackPublication | undefined => p.getTrackPublication(Track.Source.ScreenShare)

// A faixa de vídeo da transmissão que estou assistindo, por pessoa (a tela de assistir lê daqui).
const screenTracks = new Map<string, VideoTrack>()
const screenTrackListeners = new Set<(userId: string) => void>()
const emitScreenTrack = (userId: string): void => screenTrackListeners.forEach((l) => l(userId))

/** A faixa de vídeo da transmissão de `userId`, se estou assistindo. */
export const getScreenTrack = (userId: string): VideoTrack | undefined => screenTracks.get(userId)

/** Avisa quando a faixa de `userId` chega ou sai. Devolve o "desligar". */
export function onScreenTrack(listener: (userId: string) => void): () => void {
  screenTrackListeners.add(listener)
  return () => screenTrackListeners.delete(listener)
}

/** Desliga a minha transmissão e libera a captura nativa (senão o serviço de captura de tela do Android fica preso). */
async function stopScreenShare(current: Room): Promise<void> {
  const track = current.localParticipant.getTrackPublication(Track.Source.ScreenShare)?.track?.mediaStreamTrack
  await current.localParticipant.setScreenShareEnabled(false).catch(() => {})
  releaseNativeTrack(track)
}

/** Desliga a minha câmera e libera a captura nativa (senão a câmera continua presa ao app). */
async function stopCamera(current: Room): Promise<void> {
  const track = current.localParticipant.getTrackPublication(Track.Source.Camera)?.track?.mediaStreamTrack
  await current.localParticipant.setCameraEnabled(false).catch(() => {})
  releaseNativeTrack(track)
}

/** Sai da sala: antes libera a captura de tela e a câmera (se houver) e só então desconecta. */
async function closeRoom(current: Room | null): Promise<void> {
  if (!current) return
  await stopScreenShare(current)
  await stopCamera(current)
  if (current.state !== ConnectionState.Disconnected) await current.disconnect()
}

/** Faixas que capturam no aparelho (tela e câmera): liberadas no nativo ao sair, senão a captura fica presa. */
const isNativeSource = (source: Track.Source): boolean => source === Track.Source.ScreenShare || source === Track.Source.Camera

export function createLiveKitMedia(): CallMedia {
  let room: Room | null = null
  let listening = true
  const speakerListeners = new Set<(ids: string[]) => void>()
  const connectionListeners = new Set<(state: MediaConnection) => void>()
  const screenListeners = new Set<(ids: string[]) => void>()
  const peerListeners = new Set<(peers: Record<string, string>) => void>()
  const cameraListeners = new Set<(ids: string[]) => void>()
  let facing: 'user' | 'environment' = 'user'
  const native = createNativeTracks()
  // A telemetria lê o getStats() desta sala (docs/adr/0070).
  let stats: CallStatsReader | null = null

  const emitConnection = (state: MediaConnection): void => connectionListeners.forEach((l) => l(state))

  /** Quem está transmitindo a tela (eu e quem publicou a faixa de tela). */
  function emitScreens(current: Room): void {
    const ids = [...current.remoteParticipants.values()].filter((p) => screenOf(p)).map((p) => p.identity)
    if (current.localParticipant.isScreenShareEnabled) ids.push(current.localParticipant.identity)
    screenListeners.forEach((l) => l(ids))
  }

  /** Quem está com a câmera ligada (eu e quem publicou a faixa da câmera sem mudo). */
  function emitCameras(current: Room): void {
    const ids = [...current.remoteParticipants.values()].filter((p) => p.isCameraEnabled).map((p) => p.identity)
    if (current.localParticipant.isCameraEnabled) ids.push(current.localParticipant.identity)
    cameraListeners.forEach((l) => l(ids))
  }

  /** A faixa da câmera de alguém chegou ou saiu: guarda para desenhar e avisa quem está com a câmera ligada. */
  function cameraChanged(current: Room, userId: string, track: VideoTrack | undefined): void {
    setCameraTrack(userId, track)
    emitCameras(current)
  }

  /** Quem está na sala (sem mim): identidade -> nome do token. */
  function emitPeers(current: Room): void {
    const peers = Object.fromEntries([...current.remoteParticipants.values()].map((p) => [p.identity, p.name || '']))
    peerListeners.forEach((l) => l(peers))
  }

  function watch(next: Room): void {
    next.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
      const ids = speakers.map((s) => s.identity)
      speakerListeners.forEach((l) => l(ids))
    })
    next.on(RoomEvent.Reconnecting, () => emitConnection('reconnecting'))
    next.on(RoomEvent.Reconnected, () => emitConnection('connected'))
    next.on(RoomEvent.Disconnected, (reason) => {
      // Derrubado pelo servidor ou por outro aparelho: as publicações já sumiram, então libera pelo registro.
      native.releaseAll()
      emitConnection(reason === DisconnectReason.DUPLICATE_IDENTITY ? 'replaced' : 'disconnected')
    })
    next.on(RoomEvent.ParticipantConnected, () => {
      setRemoteVolume(next, listening)
      emitPeers(next)
    })
    next.on(RoomEvent.ParticipantDisconnected, () => emitPeers(next))
    // Ver a tela dos outros só quando se pede: o vídeo não desce sozinho.
    next.on(RoomEvent.TrackPublished, (pub) => {
      if (pub.source === Track.Source.ScreenShare) {
        pub.setSubscribed(false)
        emitScreens(next)
      }
    })
    next.on(RoomEvent.TrackUnpublished, () => {
      emitScreens(next)
      emitCameras(next)
    })
    next.on(RoomEvent.TrackMuted, () => emitCameras(next))
    next.on(RoomEvent.TrackUnmuted, () => emitCameras(next))
    next.on(RoomEvent.LocalTrackPublished, (pub) => {
      emitScreens(next)
      if (isNativeSource(pub.source)) native.keep(pub.track?.mediaStreamTrack)
      if (pub.source === Track.Source.Camera) cameraChanged(next, next.localParticipant.identity, pub.track as VideoTrack)
    })
    next.on(RoomEvent.LocalTrackUnpublished, (pub) => {
      emitScreens(next)
      native.release(pub.track?.mediaStreamTrack)
      if (pub.source === Track.Source.Camera) cameraChanged(next, next.localParticipant.identity, undefined)
    })
    next.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
      if (track.source === Track.Source.Camera) return cameraChanged(next, participant.identity, track as VideoTrack)
      if (track.source !== Track.Source.ScreenShare) return
      screenTracks.set(participant.identity, track as VideoTrack)
      emitScreenTrack(participant.identity)
    })
    next.on(RoomEvent.TrackUnsubscribed, (track, _pub, participant) => {
      if (track.source === Track.Source.Camera) return cameraChanged(next, participant.identity, undefined)
      if (track.source !== Track.Source.ScreenShare) return
      screenTracks.delete(participant.identity)
      emitScreenTrack(participant.identity)
    })
  }

  return {
    async connect(url, token) {
      await AudioSession.startAudioSession()
      const next = new Room()
      watch(next)
      room = next
      await next.connect(url, token)
      // Antes de publicar vídeo: sem isso a segunda faixa de vídeo derruba a transmissão (startBitrate.ts).
      if (!disableVideoStartBitrate(next as never)) console.warn('[call] livekit-client mudou: start bitrate não desligado')
      setRemoteVolume(next, listening)
      // Quem já transmitia antes de eu entrar.
      next.remoteParticipants.forEach((p) => screenOf(p)?.setSubscribed(false))
      emitScreens(next)
      emitPeers(next)
      emitCameras(next)
      setActiveCallStats((stats = createLiveKitStats(next)))
    },
    async disconnect() {
      const current = room
      room = null
      if (stats) clearActiveCallStats(stats)
      screenTracks.clear()
      clearCameraTracks()
      await closeRoom(current)
      native.releaseAll()
      await AudioSession.stopAudioSession()
    },
    async setMicEnabled(on) {
      await room?.localParticipant.setMicrophoneEnabled(on)
    },
    async setScreenShareEnabled(on) {
      if (!on && room) await stopScreenShare(room)
      else await room?.localParticipant.setScreenShareEnabled(on)
    },
    async setCameraEnabled(on) {
      if (!room) return
      if (!on) return stopCamera(room)
      await room.localParticipant.setCameraEnabled(true, { facingMode: facing })
    },
    async flipCamera() {
      const track = room?.localParticipant.getTrackPublication(Track.Source.Camera)?.track as LocalVideoTrack | undefined
      if (!track) return
      facing = facing === 'user' ? 'environment' : 'user'
      await track.restartTrack({ facingMode: facing })
    },
    onCameras(listener) {
      cameraListeners.add(listener)
      return () => cameraListeners.delete(listener)
    },
    watchScreen(userId, on) {
      const participant = room?.remoteParticipants.get(userId)
      if (participant) screenOf(participant)?.setSubscribed(on)
    },
    setListening(on) {
      listening = on
      if (room) setRemoteVolume(room, on)
    },
    setUserVolume(userId, volume) {
      userVolumes.set(userId, volume)
      if (room) setRemoteVolume(room, listening)
    },
    onSpeakers(listener) {
      speakerListeners.add(listener)
      return () => speakerListeners.delete(listener)
    },
    onPeers(listener) {
      peerListeners.add(listener)
      return () => peerListeners.delete(listener)
    },
    onScreens(listener) {
      screenListeners.add(listener)
      return () => screenListeners.delete(listener)
    },
    onConnection(listener) {
      connectionListeners.add(listener)
      return () => connectionListeners.delete(listener)
    }
  }
}
