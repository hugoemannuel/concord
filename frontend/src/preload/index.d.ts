import { ElectronAPI } from '@electron-toolkit/preload'
import type { OverlaySnapshot } from '../renderer/src/lib/overlayState'
import type { OverlayFrame, OverlayLayout } from '../renderer/src/lib/overlayLayout'
import type { CallResume, PendingCallResume } from '../shared/callResume'
import type { AppMetrics } from '../shared/appMetrics'
import type { ProbeResult, ServerInfo } from '../shared/serverAddress'
import type { HostEvent, VpsForm } from '../shared/hostServer'

/** "Hospedar um servidor" numa VPS (salinha-host deploy). */
export interface HostApi {
  /** Instala o servidor na VPS pelo SSH (andamento em onEvent). false = falhou ou ocupado. */
  deploy(form: VpsForm): Promise<boolean>
  /** Escolher o arquivo da chave SSH; null = cancelou. */
  pickKey(): Promise<string | null>
  /** A VPS foi reinstalada: esquece a identidade antiga dela. */
  forgetKey(host: string): Promise<boolean>
  /** Entra no servidor recém-instalado (endereço público) e reabre o app. */
  finish(): Promise<boolean>
  /** Eventos do andamento. Retorna unsubscribe. */
  onEvent(cb: (event: HostEvent) => void): () => void
}

/** Servidor do app (build genérico: escolhido na tela inicial). */
export interface ServerApi {
  /** Servidor desta execução; undefined = nenhum ainda (tela inicial). */
  url: string | undefined
  info(): Promise<ServerInfo>
  /** Confere se o endereço é um servidor da Salinha no ar. */
  probe(address: string): Promise<ProbeResult>
  /** Confere, salva e reabre o app falando com ele. */
  connect(address: string): Promise<ProbeResult>
  /** Esquece o servidor e reabre na tela inicial (saia da conta antes). */
  forget(): Promise<boolean>
}

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
  onWindowHidden(cb: () => void): () => void
  ended(): void
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

export interface ActivitiesApi {
  /** Abre o jogo numa janela própria; false = link recusado pelo main. */
  open(activityId: string, url: string): Promise<boolean>
  close(): void
  /** A janela do jogo fechou (pelo usuário ou pelo app). Retorna unsubscribe. */
  onClosed(cb: (activityId: string) => void): () => void
}

/** Atalho do modo de edição e se outro programa já tem ele. */
export interface OverlayShortcutStatus {
  accelerator: string
  taken: boolean
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

declare global {
  interface Window {
    electron: ElectronAPI
    api?: {
      server?: ServerApi
      host?: HostApi
      appMetrics?: { sample(reset?: boolean): Promise<AppMetrics | null> }
      screenPicker: ScreenPickerApi
      background?: BackgroundApi
      updates?: UpdatesApi
      screenAudio?: ScreenAudioApi
      screenShare?: ScreenShareApi
      overlay?: OverlayApi
      inviteLinks?: InviteLinksApi
      activities?: ActivitiesApi
      games?: GamesApi
      keybinds?: KeybindsApi
    }
  }
}
