// Atualização ao abrir o app (ADR 0044): antes da janela principal, a janelinha
// de abertura checa o manifesto; se houver versão nova, baixa (com o progresso
// real), verifica a assinatura e instala — e só depois abre. Qualquer falha,
// demora ou "Abrir sem atualizar" abre a versão atual: a abertura nunca trava.
//
// Pura (sem Electron): quem cria passa a checagem, o download e onde mostrar.
// O updater.ts avisa o progresso, a verificação, o "pronto" e as falhas.

export type StartupPhase = 'checking' | 'downloading' | 'installing' | 'opening'

export interface StartupView {
  phase: StartupPhase
  /** só baixando: 0–100 */
  percent: number | null
  /** mostra o "Abrir sem atualizar" */
  canSkip: boolean
}

/** Sem resposta do manifesto nesse tempo (sem rede, servidor fora): abre. */
export const CHECK_TIMEOUT_MS = 5_000
/** O "Abrir sem atualizar" aparece depois desse tempo baixando. */
export const SKIP_AFTER_MS = 3_000
/** Download sem nenhum progresso nesse tempo: abre (ele segue em segundo plano). */
export const STALL_TIMEOUT_MS = 30_000
/** Verificar, extrair (Linux) e fechar para instalar passou disso: abre. */
export const INSTALL_TIMEOUT_MS = 90_000

export interface StartupFlowDeps {
  /** Checa o manifesto: true = versão nova para baixar e instalar agora. */
  check: () => Promise<boolean>
  /** Baixa já, sem o sorteio do segundo plano. */
  download: () => void
  show: (view: StartupView) => void
  log: (message: string, error?: unknown) => void
}

export interface StartupFlow {
  /** Resolve quando é hora de abrir a janela principal (não resolve se o app fechou para instalar). */
  run(): Promise<void>
  progress(percent: number): void
  /** Baixou: conferindo a assinatura (e extraindo, no Linux). */
  verifying(): void
  /** Baixada e verificada. true = instalar agora (a abertura ainda espera). */
  ready(): boolean
  failed(reason: string, error?: unknown): void
  /** Clique em "Abrir sem atualizar". */
  skip(): void
}

export function createStartupFlow(deps: StartupFlowDeps): StartupFlow {
  let view: StartupView = { phase: 'checking', percent: null, canSkip: false }
  let open: () => void = () => {}
  const opened = new Promise<void>((resolve) => (open = resolve))
  let timer: ReturnType<typeof setTimeout> | null = null
  let skipTimer: ReturnType<typeof setTimeout> | null = null

  const active = (): boolean => view.phase !== 'opening'

  function show(next: Partial<StartupView>): void {
    view = { ...view, ...next }
    deps.show(view)
  }

  /** Um prazo por vez: checagem, download parado ou instalação. */
  function deadline(ms: number, reason: string): void {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => finish(reason), ms)
  }

  function finish(reason: string | null, error?: unknown): void {
    if (!active()) return
    if (timer) clearTimeout(timer)
    if (skipTimer) clearTimeout(skipTimer)
    if (reason) deps.log(`abrindo sem atualizar: ${reason}`, error)
    show({ phase: 'opening', percent: null, canSkip: false })
    open()
  }

  function startDownload(): void {
    show({ phase: 'downloading', percent: 0 })
    deadline(STALL_TIMEOUT_MS, 'download parado')
    skipTimer = setTimeout(() => {
      if (view.phase === 'downloading') show({ canSkip: true })
    }, SKIP_AFTER_MS)
    deps.download()
  }

  function verifying(): void {
    if (view.phase !== 'downloading') return
    deadline(INSTALL_TIMEOUT_MS, 'instalação passou do tempo')
    show({ phase: 'installing', percent: null, canSkip: false })
  }

  async function check(): Promise<void> {
    deadline(CHECK_TIMEOUT_MS, 'checagem passou do tempo')
    let available: boolean
    try {
      available = await deps.check()
    } catch (error) {
      finish('checagem falhou', error)
      return
    }
    // Respondeu depois do prazo: o app já abriu.
    if (!active()) return
    if (available) startDownload()
    else finish(null)
  }

  return {
    run() {
      deps.show(view)
      void check()
      return opened
    },
    progress(percent) {
      if (view.phase !== 'downloading') return
      const rounded = Math.min(100, Math.max(0, Math.floor(percent)))
      deadline(STALL_TIMEOUT_MS, 'download parado')
      if (rounded !== view.percent) show({ percent: rounded })
    },
    verifying,
    ready() {
      verifying()
      return view.phase === 'installing'
    },
    failed(reason, error) {
      finish(reason, error)
    },
    skip() {
      if (view.canSkip) finish('a pessoa pulou')
    }
  }
}

/** O que o updater avisa à janelinha (ver updater.ts). */
export type StartupWatcher = Pick<StartupFlow, 'progress' | 'verifying' | 'ready' | 'failed'>

/** O que a janelinha usa do updater. */
export interface StartupUpdate {
  /** Espera a checagem do boot: true = versão nova que pode instalar sozinha. */
  check(): Promise<boolean>
  /** Baixa já, sem o sorteio do segundo plano. */
  download(): void
  /** null: a janelinha saiu (abriu ou pulou); daí em diante, só o aviso na barra. */
  watch(watcher: StartupWatcher | null): void
}
