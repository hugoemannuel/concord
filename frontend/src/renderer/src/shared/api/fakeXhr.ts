type ProgressEvt = { lengthComputable: boolean; loaded: number; total: number }

/**
 * XMLHttpRequest de mentira para os testes de upload (rodam sem DOM): guarda
 * o pedido e responde quando o teste mandar. `FakeXhr.all` tem todos os
 * pedidos na ordem; `FakeXhr.last`, o mais recente.
 */
export class FakeXhr {
  static all: FakeXhr[] = []
  static get last(): FakeXhr | undefined {
    return FakeXhr.all[FakeXhr.all.length - 1]
  }

  method = ''
  url = ''
  headers: Record<string, string> = {}
  body: FormData | null = null
  status = 0
  responseText = ''
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  onabort: (() => void) | null = null
  private progressListeners: ((e: ProgressEvt) => void)[] = []
  upload = {
    addEventListener: (_type: string, fn: (e: ProgressEvt) => void): void => {
      this.progressListeners.push(fn)
    }
  }

  constructor() {
    FakeXhr.all.push(this)
  }

  open(method: string, url: string): void {
    this.method = method
    this.url = url
  }

  setRequestHeader(name: string, value: string): void {
    this.headers[name] = value
  }

  send(body: FormData): void {
    this.body = body
  }

  abort(): void {
    this.onabort?.()
  }

  /** Responde com o corpo em JSON (string vai crua, para testar corpo inválido). */
  respond(status: number, body: unknown): void {
    this.status = status
    this.responseText = typeof body === 'string' ? body : JSON.stringify(body)
    this.onload?.()
  }

  progress(loaded: number, total: number, lengthComputable = true): void {
    for (const fn of this.progressListeners) fn({ lengthComputable, loaded, total })
  }

  fail(): void {
    this.onerror?.()
  }
}
