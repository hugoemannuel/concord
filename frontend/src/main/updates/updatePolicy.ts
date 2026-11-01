// Quando baixar/instalar atualizações. Puro para poder testar.

/** Logo ao abrir o app, o download não espera o sorteio. */
const STARTUP_WINDOW_MS = 30_000

/** Espalha os downloads em segundo plano por até 2 min (ver backgroundDownloadDelayMs). */
export const DOWNLOAD_JITTER_MAX_MS = 120_000

/**
 * Espera antes de baixar em segundo plano. O aviso do servidor (app:update)
 * e a checagem periódica acham a versão nova em todos os apps quase ao mesmo
 * tempo; baixar o instalador (~120 MB) junto saturaria o upload do servidor,
 * que é o mesmo da voz de quem está em chamada. O aviso na tela não espera.
 *
 * Sem espera: quando a pessoa pediu (Atualizar) e logo ao abrir o app (cada
 * um abre numa hora, e a instalação ao abrir precisa do download do cache
 * dentro da janela de início).
 */
export function backgroundDownloadDelayMs(
  state: {
    /** clicou em Atualizar */
    force: boolean
    msSinceStart: number
    /** Math.random(): [0, 1) */
    random: number
  },
  maxMs = DOWNLOAD_JITTER_MAX_MS
): number {
  if (state.force || state.msSinceStart <= STARTUP_WINDOW_MS) return 0
  const r = Math.min(Math.max(state.random, 0), 1)
  return Math.floor(r * maxMs)
}

/** Espera depois de N falhas seguidas de download/verificação: 1 min … 6 h. */
const RETRY_STEPS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3_600_000, 6 * 3_600_000]

/**
 * Download ou verificação que falhou não é repetido a cada checagem (60 s):
 * cada tentativa são ~140 MB saindo do mesmo upload que leva a voz.
 */
export function retryDelayMs(failures: number): number {
  if (failures <= 0) return 0
  return RETRY_STEPS_MS[Math.min(failures, RETRY_STEPS_MS.length) - 1]
}

export interface ReleaseId {
  version: string
  /** sha512 do manifesto ('' se desconhecido) */
  sha512: string
}

/**
 * Atualização recusada (assinatura ou pacote inválido) não é baixada de novo
 * enquanto o manifesto oferecer o mesmo par versão + sha512.
 */
export function isRefusedRelease(refused: ReleaseId | null, offer: ReleaseId): boolean {
  return !!refused && refused.version === offer.version && refused.sha512 === offer.sha512
}

/**
 * No Linux, o electron-updater só atualiza o próprio AppImage (variável
 * APPIMAGE, definida pelo runtime do AppImage). Fora dele (AppImage extraído,
 * instalação por usuário) quem atualiza é o updater próprio (linuxUpdater.ts);
 * só sem ele (build sem endereço/chave) o app avisa que não se atualiza.
 */
export function autoUpdateUnavailable(env: {
  platform: string
  isPackaged: boolean
  appImage: string | undefined
  /** o updater próprio do Linux está ativo */
  selfUpdating: boolean
}): boolean {
  return env.platform === 'linux' && env.isPackaged && !env.appImage && !env.selfUpdating
}
