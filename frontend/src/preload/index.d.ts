import type { OverlaySnapshot } from '../renderer/src/features/overlay/lib/overlayState'
import type { OverlayFrame, OverlayLayout } from '../renderer/src/features/overlay/lib/overlayLayout'
import type { CallResume, PendingCallResume } from '../shared/callResume'
import type { AppMetrics } from '../shared/appMetrics'
import type { PerfEvent } from '../shared/perfLog'
import type { PortalStatus, ScreenShareFlow } from '../shared/screenShareFlow'
import type { ServerDiagnostics } from '../shared/serverConnection'
import type { TTSVoiceState } from '../shared/ttsVoice'
import type { NativeLiveApi } from './nativeLiveApi'

export interface ScreenSourceInfo {
  id: string
  name: string
  thumbnail: string
  appIcon: string | null
  displayId: string
}

export interface ScreenPickerApi {
  onShow(cb: () => void): () => void
  listSources(): Promise<ScreenSourceInfo[]>
  select(sourceId: string): void
  cancel(): void
}

export interface ScreenAudioApi {
  onFallback(cb: (logPath: string) => void): () => void
  stop(): void
}

export interface ScreenShareApi {
  flow: ScreenShareFlow
  portalStatus(): Promise<{ status: PortalStatus; message: string }>
  preferGameWindow(gameName: string): Promise<string | null>
  onWindowHidden(cb: () => void): () => void
  ended(): void
  videoHint(): Promise<string | null>
}

export interface UpdatesApi {
  setCallSnapshot(snapshot: CallResume | null): void
  takeCallResume(): Promise<PendingCallResume | null>
  currentVersion(): Promise<string>
  status(): Promise<{ version: string; ready: boolean } | null>
  autoUpdateUnavailable(): Promise<boolean>
  onAvailable(cb: (version: string) => void): () => void
  onReady(cb: (version: string) => void): () => void
  onProgress(cb: (percent: number) => void): () => void
  onError(cb: (message: string) => void): () => void
  install(): void
  checkNow(): void
  /** Linux: motivo de o app ter aberto sem o sandbox (só a 1ª vez), senão null. */
  sandboxNotice(): Promise<string | null>
}

export interface BackgroundApi {
  setCallState(state: { inCall: boolean; muted: boolean }): void
  notify(payload: {
    title: string
    body: string
    route: string
    urgent?: boolean
    /** Toast nativo (padrão: ligado). */
    toast?: boolean
    /** Piscar + selo de não lidas na barra de tarefas (padrão: ligado). */
    taskbar?: boolean
    /** A conversa não está na tela: o toast aparece mesmo com a janela em foco. */
    elsewhere?: boolean
  }): void
  quit(): void
  /** null = não suportado nesta plataforma */
  getAutostart(): Promise<boolean | null>
  setAutostart(enabled: boolean): Promise<boolean | null>
  /** Só Linux com bandeja criada (null nas outras plataformas). */
  getCloseToTray(): Promise<{ enabled: boolean; available: boolean } | null>
  setCloseToTray(enabled: boolean): Promise<boolean | null>
  onToggleMute(cb: () => void): () => void
  onQuitRequested(cb: () => void): () => void
  onNavigate(cb: (route: string) => void): () => void
}

/** Links salinha://convite/<código> que abriram o app. */
export interface InviteLinksApi {
  /** Convite que chegou e ainda não foi aberto (busca uma vez só), ou null. */
  takePending(): Promise<string | null>
  /** Chegou um convite (busque com takePending). Retorna unsubscribe. */
  onPending(cb: () => void): () => void
}

export interface KeybindsApi {
  /** Atalhos de voz com o app em segundo plano; devolve, por ação, se ficou valendo. */
  setGlobal(list: { id: string; binding: string }[]): Promise<Record<string, boolean>>
  /** Gravando um atalho nas configurações: solta os globais enquanto isso. */
  suspend(on: boolean): void
  /** Um atalho global foi acionado (id da ação). Retorna unsubscribe. */
  onFire(cb: (id: string) => void): () => void
  /** Os globais voltaram depois de uma suspensão: o que ficou valendo. Retorna unsubscribe. */
  onStatus(cb: (status: Record<string, boolean>) => void): () => void
}

export interface DetectedGameInfo {
  name: string
  /** Unix em ms de quando a Salinha o viu abrir. */
  startedAt: number
  /** appid e ícone (sha1) na Steam, quando o jogo é da Steam. */
  appId?: number
  iconHash?: string
}

export interface GamesApi {
  /** Liga/desliga a detecção de jogos (Em atividade). Só Windows. */
  watch(enabled: boolean): void
  current(): Promise<DetectedGameInfo | null>
  /** O jogo em andamento mudou (null = parou). Retorna unsubscribe. */
  onChange(cb: (game: DetectedGameInfo | null) => void): () => void
}

export interface MusicApi {
  /** Liga/desliga a detecção da música tocando (Ouvindo). Windows e Linux. */
  watch(enabled: boolean): void
  /** Música atual; o renderer valida (sanitizeDetectedTrack). */
  current(): Promise<unknown>
  /** A música mudou (null = parou). Retorna unsubscribe. */
  onChange(cb: (track: unknown) => void): () => void
}

export interface ActivitiesApi {
  /** Abre o jogo numa janela própria; false = link recusado pelo main. */
  open(activityId: string, url: string): Promise<boolean>
  close(): void
  /** A janela do jogo fechou (pelo usuário ou pelo app). Retorna unsubscribe. */
  onClosed(cb: (activityId: string) => void): () => void
  /** A janela do jogo entrou numa sala nova (URL já canônica). Retorna unsubscribe. */
  onRoom(cb: (activityId: string, url: string) => void): () => void
}

/** Atalho do modo de edição e se outro programa já tem ele. */
export interface OverlayShortcutStatus {
  accelerator: string
  taken: boolean
}

export interface ServerApi {
  /** Endereço que respondeu ao abrir o app; null = o do build. */
  url: string | null
  /** Versão, endereço em uso e testes de rede (`retest`: testa de novo agora). */
  diagnostics(retest?: boolean): Promise<ServerDiagnostics | null>
}

export interface WindowThemeApi {
  /** Pinta a barra de título nativa (Windows/Linux) com as cores do tema. */
  setTitleBarColors(colors: { color: string; symbolColor: string }): void
}

export interface OverlayApi {
  /** Overlay de jogo existe nesta plataforma (só Windows). */
  supported: boolean
  /** Renderer principal → main: estado atual da call para o overlay. */
  setState(snapshot: OverlaySnapshot): void
  /**
   * Página do overlay: avisa que carregou (chamar depois de assinar onUpdate e
   * onEditing) e recebe o último estado e se está no modo de edição.
   */
  ready(): Promise<{
    snapshot: OverlaySnapshot | null
    editing: boolean
    frame: OverlayFrame | null
  }>
  /** Página do overlay: onde a janela está na área de trabalho. Retorna unsubscribe. */
  onFrame(cb: (frame: OverlayFrame) => void): () => void
  /** Página do overlay: tamanho medido da lista, para a janela ficar só em volta dela. */
  reportBox(size: { width: number; height: number }): void
  /** Página do overlay: novos estados. Retorna unsubscribe. */
  onUpdate(cb: (snapshot: OverlaySnapshot) => void): () => void
  /** Página do overlay: modo de edição (Shift+Tab) ligado/desligado. Retorna unsubscribe. */
  onEditing(cb: (editing: boolean) => void): () => void
  /** Página do overlay: posição/tamanho novos, ao soltar o mouse. */
  saveLayout(layout: OverlayLayout): void
  /** Configurações: o atalho está livre? null = atalho inválido. */
  checkShortcut(accelerator: string): Promise<OverlayShortcutStatus | null>
  /** Configurações: resultado de segurar o atalho no jogo. Retorna unsubscribe. */
  onShortcutStatus(cb: (status: OverlayShortcutStatus) => void): () => void
  /** Renderer principal: posição/tamanho editados no jogo, para salvar. Retorna unsubscribe. */
  onLayout(cb: (layout: OverlayLayout) => void): () => void
}

/** Voz do /tts baixada no primeiro uso (Linux). */
export interface TTSApi {
  voiceState(): Promise<TTSVoiceState>
  /** Baixa a voz se ainda não está pronta (ligou o interruptor, "Tentar de novo"). */
  prepare(): void
  /** WAV da fala, ou null (voz não pronta: a primeira chamada começa o download). */
  speak(text: string): Promise<Uint8Array | null>
  onVoiceState(cb: (state: TTSVoiceState) => void): () => void
}

declare global {
  interface Window {
    api?: {
      /** Sistema operacional do app desktop (process.platform). */
      platform?: string
      appMetrics?: { sample(reset?: boolean): Promise<AppMetrics | null> }
      perf?: { enabled(): Promise<boolean>; report(event: PerfEvent): void }
      /** Foco/visibilidade da janela; o renderer valida com parseWindowActivity. */
      windowActivity?: { onChange(cb: (activity: unknown) => void): () => void }
      screenPicker: ScreenPickerApi
      background?: BackgroundApi
      updates?: UpdatesApi
      screenAudio?: ScreenAudioApi
      screenShare?: ScreenShareApi
      overlay?: OverlayApi
      inviteLinks?: InviteLinksApi
      activities?: ActivitiesApi
      games?: GamesApi
      music?: MusicApi
      keybinds?: KeybindsApi
      windowTheme?: WindowThemeApi
      server?: ServerApi
      /** Só no app desktop do Linux (docs/adr/0014-voz-piper-no-linux.md). */
      tts?: TTSApi
      /** Live pelo motor nativo (docs/adr/0031-live-pelo-helper-rust.md): só no Linux. */
      nativeLive?: NativeLiveApi
    }
  }
}
