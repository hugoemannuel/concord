// Pedido de getDisplayMedia aguardando o modal do app (Compartilhar/Cancelar).
// Recusar é `callback(null)`: com `{}` o Electron entende "vídeo pedido sem
// vídeo" e lança no processo main ("Video was requested, but no video stream
// was provided").

export type DisplayStreams = {
  video?: Electron.DesktopCapturerSource
  audio?: 'loopback'
}
export type DisplayCallback = (streams: DisplayStreams | null) => void

export class PendingDisplayRequest {
  private callback: DisplayCallback | null = null

  constructor(private readonly onError: (err: unknown) => void = () => {}) {}

  /** Guarda o pedido novo; um anterior sem resposta é recusado. */
  hold(callback: DisplayCallback): void {
    this.deny()
    this.callback = callback
  }

  /** Há um getDisplayMedia esperando resposta? Sem pedido, o modal não lista nem escolhe nada. */
  pending(): boolean {
    return this.callback !== null
  }

  /** O callback pendente, uma única vez. */
  take(): DisplayCallback | null {
    const callback = this.callback
    this.callback = null
    return callback
  }

  /** Recusa o pedido pendente (se houver) sem derrubar o processo. */
  deny(): void {
    const callback = this.take()
    if (!callback) return
    try {
      callback(null)
    } catch (err) {
      this.onError(err)
    }
  }
}
