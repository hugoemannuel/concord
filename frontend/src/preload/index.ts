import { contextBridge, ipcRenderer } from 'electron'
import type { CallResume, PendingCallResume } from '../shared/callResume'
import type { AppMetrics } from '../shared/appMetrics'
import type { PerfEvent } from '../shared/perfLog'
import { screenShareFlow, type PortalStatus } from '../shared/screenShareFlow'
import { serverFromArgv, type ServerDiagnostics } from '../shared/serverConnection'
import { overlayApi } from './overlayApi'
import { ttsApi } from './ttsApi'
import { nativeLiveApi } from './nativeLiveApi'

interface ScreenSourceInfo {
  id: string
  name: string
  thumbnail: string
  appIcon: string | null
  displayId: string
}

// Ponte para o renderer: só funções específicas, cada uma num canal fixo e com o
// argumento conferido no main. Nada de ipcRenderer cru nem process.env (o
// @electron-toolkit/preload expunha os dois em window.electron e saiu).
const api = {
  /** Sistema operacional (win32, linux, darwin). */
  platform: process.platform,
  server: {
    /** Endereço escolhido pelo main ao abrir (ver main/server); null = o do build. */
    url: serverFromArgv(process.argv),
    diagnostics(retest = false): Promise<ServerDiagnostics | null> {
      return ipcRenderer.invoke('server:diagnostics', retest)
    }
  },
  appMetrics: {
    sample(reset = false): Promise<AppMetrics | null> {
      return ipcRenderer.invoke('app-metrics:sample', reset)
    }
  },
  windowActivity: {
    /** Foco e visibilidade da janela (o main avisa a cada mudança). Retorna unsubscribe. */
    onChange(cb: (activity: unknown) => void): () => void {
      const listener = (_event: unknown, activity: unknown): void => cb(activity)
      ipcRenderer.on('window:activity', listener)
      return () => ipcRenderer.removeListener('window:activity', listener)
    }
  },
  perf: {
    /** O main responde true só quando o app foi aberto com --perf-log. */
    enabled(): Promise<boolean> {
      return ipcRenderer.invoke('perf:enabled')
    },
    report(event: PerfEvent): void {
      ipcRenderer.send('perf:report', event)
    }
  },
  windowTheme: {
    /** Pinta a barra de título nativa (Windows/Linux) com as cores do tema. */
    setTitleBarColors(colors: { color: string; symbolColor: string }): void {
      ipcRenderer.send('window:title-bar-colors', colors)
    }
  },
  screenPicker: {
    /** Main avisa que um pedido de getDisplayMedia está aguardando seleção. */
    onShow(cb: () => void): () => void {
      const listener = (): void => cb()
      ipcRenderer.on('screen-picker:show', listener)
      return () => ipcRenderer.removeListener('screen-picker:show', listener)
    },
    listSources(): Promise<ScreenSourceInfo[]> {
      return ipcRenderer.invoke('screen-picker:sources')
    },
    select(sourceId: string): void {
      ipcRenderer.send('screen-picker:select', sourceId)
    },
    cancel(): void {
      ipcRenderer.send('screen-picker:cancel')
    }
  },
  screenShare: {
    /** 'portal' = Linux/Wayland: o seletor é o do sistema, não o modal do app. */
    flow: screenShareFlow(process.platform, process.env),
    /** O portal de captura (xdg-desktop-portal ScreenCast) está instalado? */
    portalStatus(): Promise<{ status: PortalStatus; message: string }> {
      return ipcRenderer.invoke('screen-share:portal-status')
    },
    /** A janela compartilhada sumiu da tela (minimizada): a live congela. */
    onWindowHidden(cb: () => void): () => void {
      const listener = (): void => cb()
      ipcRenderer.on('screen-share:window-hidden', listener)
      return () => ipcRenderer.removeListener('screen-share:window-hidden', listener)
    },
    /** Acha a janela do jogo; id da fonte = o próximo compartilhamento a usa, sem o modal. */
    preferGameWindow(gameName: string): Promise<string | null> {
      return ipcRenderer.invoke('screen-share:prefer-game', gameName)
    },
    /** O compartilhamento acabou: para de vigiar a janela. */
    ended(): void {
      ipcRenderer.send('screen-share:ended')
    },
    /** O que falta para a placa de vídeo decodificar (Linux/NVIDIA sem driver); null = nada. */
    videoHint(): Promise<string | null> {
      return ipcRenderer.invoke('screen-share:video-hint')
    }
  },
  screenAudio: {
    /** Não deu para capturar só a janela: o som vai ser o do sistema. */
    onFallback(cb: (logPath: string) => void): () => void {
      const listener = (_e: unknown, logPath: string): void => cb(logPath)
      ipcRenderer.on('screen-audio:fallback', listener)
      return () => ipcRenderer.removeListener('screen-audio:fallback', listener)
    },
    /** Para a captura do som da janela (fim do compartilhamento). */
    stop(): void {
      ipcRenderer.send('screen-audio:stop')
    }
  },
  updates: {
    setCallSnapshot(snapshot: CallResume | null): void {
      ipcRenderer.send('update:call-snapshot', snapshot)
    },
    takeCallResume(): Promise<PendingCallResume | null> {
      return ipcRenderer.invoke('update:take-call-resume')
    },
    /** Versão instalada deste app. */
    currentVersion(): Promise<string> {
      return ipcRenderer.invoke('update:current-version')
    },
    /** Versão nova conhecida (e se já está pronta para instalar), ou null. */
    status(): Promise<{ version: string; ready: boolean } | null> {
      return ipcRenderer.invoke('update:status')
    },
    /** true = esta instalação não se atualiza sozinha (Linux sem AppImage). */
    autoUpdateUnavailable(): Promise<boolean> {
      return ipcRenderer.invoke('update:unavailable')
    },
    /** Existe versão nova (pode ainda estar baixando). */
    onAvailable(cb: (version: string) => void): () => void {
      const listener = (_e: unknown, version: string): void => cb(version)
      ipcRenderer.on('update:available', listener)
      return () => ipcRenderer.removeListener('update:available', listener)
    },
    onReady(cb: (version: string) => void): () => void {
      const listener = (_e: unknown, version: string): void => cb(version)
      ipcRenderer.on('update:ready', listener)
      return () => ipcRenderer.removeListener('update:ready', listener)
    },
    onProgress(cb: (percent: number) => void): () => void {
      const listener = (_e: unknown, percent: number): void => cb(percent)
      ipcRenderer.on('update:progress', listener)
      return () => ipcRenderer.removeListener('update:progress', listener)
    },
    onError(cb: (message: string) => void): () => void {
      const listener = (_e: unknown, message: string): void => cb(message)
      ipcRenderer.on('update:error', listener)
      return () => ipcRenderer.removeListener('update:error', listener)
    },
    /** Instala (baixando antes, se precisar) e reinicia o app. */
    install(): void {
      ipcRenderer.send('update:install')
    },
    /** Checa atualização agora (servidor avisou de versão nova / WS reconectou). */
    checkNow(): void {
      ipcRenderer.send('update:check-now')
    },
    /**
     * Linux: o app abriu sem o sandbox do Chromium (motivo) — só na primeira
     * vez; depois null.
     */
    sandboxNotice(): Promise<string | null> {
      return ipcRenderer.invoke('update:sandbox-notice')
    }
  },
  background: {
    /** Estado da chamada para o menu da bandeja. */
    setCallState(state: { inCall: boolean; muted: boolean }): void {
      ipcRenderer.send('call:state', state)
    },
    /**
     * Notificação nativa e aviso na barra de tarefas (só se a janela não
     * estiver à vista; o toast também com ela em foco se `elsewhere`).
     * `toast`/`taskbar` = preferências do usuário.
     */
    notify(payload: {
      title: string
      body: string
      route: string
      urgent?: boolean
      toast?: boolean
      taskbar?: boolean
      elsewhere?: boolean
    }): void {
      ipcRenderer.send('notify', payload)
    },
    quit(): void {
      ipcRenderer.send('app:quit')
    },
    getAutostart(): Promise<boolean | null> {
      return ipcRenderer.invoke('settings:autostart')
    },
    setAutostart(enabled: boolean): Promise<boolean | null> {
      return ipcRenderer.invoke('settings:set-autostart', enabled)
    },
    getCloseToTray(): Promise<{ enabled: boolean; available: boolean } | null> {
      return ipcRenderer.invoke('settings:close-to-tray')
    },
    setCloseToTray(enabled: boolean): Promise<boolean | null> {
      return ipcRenderer.invoke('settings:set-close-to-tray', enabled)
    },
    onToggleMute(cb: () => void): () => void {
      const listener = (): void => cb()
      ipcRenderer.on('tray:toggle-mute', listener)
      return () => ipcRenderer.removeListener('tray:toggle-mute', listener)
    },
    onQuitRequested(cb: () => void): () => void {
      const listener = (): void => cb()
      ipcRenderer.on('app:quit-requested', listener)
      return () => ipcRenderer.removeListener('app:quit-requested', listener)
    },
    onNavigate(cb: (route: string) => void): () => void {
      const listener = (_e: unknown, route: string): void => cb(route)
      ipcRenderer.on('navigate', listener)
      return () => ipcRenderer.removeListener('navigate', listener)
    }
  },
  inviteLinks: {
    /** Convite do salinha://convite/<código> ainda não aberto (uma vez só), ou null. */
    takePending(): Promise<string | null> {
      return ipcRenderer.invoke('invite:take-pending')
    },
    /** Chegou um convite (o app já estava aberto): busque com takePending. */
    onPending(cb: () => void): () => void {
      const listener = (): void => cb()
      ipcRenderer.on('invite:open', listener)
      return () => ipcRenderer.removeListener('invite:open', listener)
    }
  },
  games: {
    /** Liga/desliga a detecção de jogos (Em atividade). Só Windows. */
    watch(enabled: boolean): void {
      ipcRenderer.send('games:watch', enabled)
    },
    current(): Promise<{
      name: string
      startedAt: number
      appId?: number
      iconHash?: string
    } | null> {
      return ipcRenderer.invoke('games:current')
    },
    /** O jogo em andamento mudou (null = parou). Retorna unsubscribe. */
    onChange(
      cb: (
        game: { name: string; startedAt: number; appId?: number; iconHash?: string } | null
      ) => void
    ): () => void {
      const listener = (
        _e: unknown,
        game: { name: string; startedAt: number; appId?: number; iconHash?: string } | null
      ): void => cb(game)
      ipcRenderer.on('games:current', listener)
      return () => ipcRenderer.removeListener('games:current', listener)
    }
  },
  music: {
    /** Liga/desliga a detecção da música tocando (Ouvindo). Windows e Linux. */
    watch(enabled: boolean): void {
      ipcRenderer.send('music:watch', enabled)
    },
    current(): Promise<unknown> {
      return ipcRenderer.invoke('music:current')
    },
    /** A música mudou (null = parou); o renderer valida. Retorna unsubscribe. */
    onChange(cb: (track: unknown) => void): () => void {
      const listener = (_e: unknown, track: unknown): void => cb(track)
      ipcRenderer.on('music:current', listener)
      return () => ipcRenderer.removeListener('music:current', listener)
    }
  },
  activities: {
    /** Abre o jogo numa janela própria; false = link recusado pelo main. */
    open(activityId: string, url: string): Promise<boolean> {
      return ipcRenderer.invoke('activity:open', activityId, url)
    },
    close(): void {
      ipcRenderer.send('activity:close')
    },
    /** A janela do jogo fechou (pelo usuário ou pelo app). */
    onClosed(cb: (activityId: string) => void): () => void {
      const listener = (_e: unknown, activityId: string): void => cb(activityId)
      ipcRenderer.on('activity:closed', listener)
      return () => ipcRenderer.removeListener('activity:closed', listener)
    },
    /** A janela do jogo entrou numa sala (partida/time) nova. */
    onRoom(cb: (activityId: string, url: string) => void): () => void {
      const listener = (_e: unknown, activityId: string, url: string): void => cb(activityId, url)
      ipcRenderer.on('activity:room', listener)
      return () => ipcRenderer.removeListener('activity:room', listener)
    }
  },
  keybinds: {
    /** Atalhos de voz com o app em segundo plano; devolve, por ação, se ficou valendo. */
    setGlobal(list: { id: string; binding: string }[]): Promise<Record<string, boolean>> {
      return ipcRenderer.invoke('keybinds:set-global', list)
    },
    /** Gravando um atalho nas configurações: solta os globais enquanto isso. */
    suspend(on: boolean): void {
      ipcRenderer.send('keybinds:suspend', on)
    },
    /** Um atalho global foi acionado (id da ação). */
    onFire(cb: (id: string) => void): () => void {
      const listener = (_e: unknown, id: string): void => cb(id)
      ipcRenderer.on('keybinds:fire', listener)
      return () => ipcRenderer.removeListener('keybinds:fire', listener)
    },
    /** Os globais voltaram depois de uma suspensão: de novo o que ficou valendo. */
    onStatus(cb: (status: Record<string, boolean>) => void): () => void {
      const listener = (_e: unknown, status: Record<string, boolean>): void => cb(status)
      ipcRenderer.on('keybinds:status', listener)
      return () => ipcRenderer.removeListener('keybinds:status', listener)
    }
  },
  overlay: overlayApi,
  /** Voz do /tts baixada no primeiro uso: só no Linux (os outros usam a Web Speech). */
  tts: process.platform === 'linux' ? ttsApi : undefined,
  /** Live pelo motor nativo (helper concord-live): só no Linux por enquanto. */
  nativeLive: process.platform === 'linux' ? nativeLiveApi : undefined
}

// Som da janela compartilhada: o MessagePort não passa pelo contextBridge,
// então vai ao mundo da página por window.postMessage (padrão do Electron).
ipcRenderer.on('screen-audio:port', (event) => {
  window.postMessage('concord:screen-audio-port', '*', event.ports)
})

// contextIsolation fica sempre ligado (padrão do Electron): a página só vê o
// que passa pelo contextBridge.
try {
  contextBridge.exposeInMainWorld('api', api)
} catch (error) {
  console.error(error)
}
