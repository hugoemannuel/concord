import { getAudioStream } from './rtc'
import type { MicHandle } from './noiseSuppression'

/**
 * Abre o microfone escolhido; se ele sumiu desde a última vez (headset
 * desconectado), avisa (`onMissing`) e usa o padrão do sistema em vez de
 * impedir a chamada.
 */
export async function openMicOrDefault(
  deviceId: string,
  onMissing: () => void
): Promise<MicHandle> {
  try {
    return await getAudioStream(deviceId)
  } catch (err) {
    const name = (err as DOMException)?.name
    if (!deviceId || (name !== 'OverconstrainedError' && name !== 'NotFoundError')) throw err
    onMissing()
    return getAudioStream('')
  }
}
