import { soundContext } from '../../call/lib/sounds'

// Toca o áudio próprio de um evento pelo mesmo contexto dos sons sintetizados
// (mesma saída de áudio, volume acima de 100% sem distorcer o elemento). O
// arquivo é baixado e decodificado uma vez; um novo toque do mesmo evento
// corta o anterior.

/** Teto do clipe: o backend aceita até 5 s pela duração que o app mede. */
export const MAX_CLIP_SECONDS = 5.5

const buffers = new Map<string, Promise<AudioBuffer | null>>()
const playing = new Map<string, AudioBufferSourceNode>()
/** Sobe a cada stopClip: um toque que ainda baixava o arquivo desiste. */
const tokens = new Map<string, number>()

async function load(context: AudioContext, src: string): Promise<AudioBuffer | null> {
  try {
    const res = await fetch(src)
    if (!res.ok) return null
    return await context.decodeAudioData(await res.arrayBuffer())
  } catch {
    return null
  }
}

function bufferFor(context: AudioContext, src: string): Promise<AudioBuffer | null> {
  const cached = buffers.get(src)
  if (cached) return cached
  const pending = load(context, src)
  buffers.set(src, pending)
  // Falhou (rede, arquivo apagado): tenta de novo no próximo toque.
  void pending.then((buffer) => {
    if (!buffer) buffers.delete(src)
  })
  return pending
}

export function stopClip(key: string): void {
  tokens.set(key, (tokens.get(key) ?? 0) + 1)
  const source = playing.get(key)
  if (!source) return
  playing.delete(key)
  try {
    source.stop()
  } catch {
    // já parou
  }
}

function start(context: AudioContext, key: string, buffer: AudioBuffer, gain: number): void {
  const source = context.createBufferSource()
  const volume = context.createGain()
  source.buffer = buffer
  volume.gain.value = gain
  source.connect(volume).connect(context.destination)
  source.onended = () => {
    if (playing.get(key) === source) playing.delete(key)
  }
  playing.set(key, source)
  source.start()
  source.stop(context.currentTime + MAX_CLIP_SECONDS)
}

/** Resolve true quando começou a tocar; false quando não deu (quem chama toca o padrão). */
export async function playClip(key: string, src: string, gain: number): Promise<boolean> {
  const context = soundContext()
  if (!context) return false
  stopClip(key)
  const token = tokens.get(key)
  const buffer = await bufferFor(context, src)
  if (!buffer) return false
  // Cortado enquanto baixava (ex.: atendeu a chamada): não toca, mas não falhou.
  if (tokens.get(key) !== token) return true
  start(context, key, buffer, gain)
  return true
}
