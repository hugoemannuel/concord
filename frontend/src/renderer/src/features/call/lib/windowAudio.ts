import workletUrl from './screenAudioWorklet.ts?worker&url'
import { PortSlot } from '../../../shared/lib/portSlot'
import { portWaitMs } from './windowAudioPolicy'

// Som só da janela compartilhada (Windows): o processo main entrega um
// MessagePort com PCM do helper nativo (perto de quando o getDisplayMedia
// resolve — a ordem entre os dois não é garantida).

const slot = new PortSlot()
let pickedWindow = false

if (typeof window !== 'undefined') {
  window.addEventListener('message', (event) => {
    // Só o preload (mesma janela) entrega a porta — não outros frames.
    if (event.source !== window) return
    if (event.data === 'concord:screen-audio-port' && event.ports[0]) slot.offer(event.ports[0])
  })
}

/** O seletor avisa o tipo de fonte escolhida ("window:…" ou "screen:…"). */
export function notePickedSource(sourceId: string): void {
  pickedWindow = sourceId.startsWith('window:')
}

/** Novo compartilhamento: joga fora restos do anterior. */
export function resetWindowAudio(): void {
  slot.discard()
  pickedWindow = false
}

/** O compartilhamento não começou (cancelou/falhou): para o helper. */
export function abortWindowAudio(): void {
  slot.discard()
  if (typeof window !== 'undefined') window.api?.screenAudio?.stop()
}

export interface WindowAudio {
  track: MediaStreamTrack
  stop: () => void
}

/** Track com o som da janela, se o main começou a capturar; senão null. */
export async function takeWindowAudio(): Promise<WindowAudio | null> {
  const port = await slot.take(portWaitMs(pickedWindow, () => window.api?.platform))
  if (!port) return null

  const ctx = new AudioContext({ sampleRate: 48_000 })
  try {
    await ctx.audioWorklet.addModule(workletUrl)
  } catch {
    port.close()
    void ctx.close()
    window.api?.screenAudio?.stop()
    return null
  }
  const node = new AudioWorkletNode(ctx, 'concord-pcm', { outputChannelCount: [2] })
  const destination = ctx.createMediaStreamDestination()
  node.connect(destination)
  port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
    node.port.postMessage(event.data, [event.data])
  }
  port.start()

  const [track] = destination.stream.getAudioTracks()
  track.contentHint = 'music'
  return {
    track,
    stop: () => {
      port.close()
      node.disconnect()
      track.stop()
      void ctx.close()
      window.api?.screenAudio?.stop()
    }
  }
}
