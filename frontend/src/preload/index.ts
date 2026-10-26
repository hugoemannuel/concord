import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { OverlaySnapshot } from '../renderer/src/lib/overlayState'
import type { OverlayFrame, OverlayLayout } from '../renderer/src/lib/overlayLayout'
import type { CallResume, PendingCallResume } from '../shared/callResume'
import type { AppMetrics } from '../shared/appMetrics'
import { serverUrlFromArgv, type ProbeResult, type ServerInfo } from '../shared/serverAddress'
import type { HostEvent, VpsForm } from '../shared/hostServer'

interface ScreenSourceInfo {
  id: string
  name: string
  thumbnail: string
  appIcon: string | null
  displayId: string
}

// Custom APIs for renderer
const api = {
  server: {
    /** Servidor desta execução (o main passa por argumento); undefined = tela inicial. */
    url: serverUrlFromArgv(process.argv),
    info(): Promise<ServerInfo> {
      return ipcRenderer.invoke('server:info')
    },
    /** Confere se o endereço é um servidor da Salinha no ar. */
    probe(address: string): Promise<ProbeResult> {
      return ipcRenderer.invoke('server:probe', address)
    },
    /** Confere, salva e reabre o app falando com ele. */
    connect(address: string): Promise<ProbeResult> {
      return ipcRenderer.invoke('server:connect', address)
    },
    /** Esquece o servidor e reabre na tela inicial (saia da conta antes). */
    forget(): Promise<boolean> {
      return ipcRenderer.invoke('server:forget')
    }
  },
  host: {
    /** Instala o servidor na VPS pelo SSH (andamento em onEvent). */
    deploy(form: VpsForm): Promise<boolean> {
      return ipcRenderer.invoke('host:deploy', form)
    },
    /** Escolher o arquivo da chave SSH; null = cancelou. */
    pickKey(): Promise<string | null> {
      return ipcRenderer.invoke('host:pick-key')
    },
    /** A VPS foi reinstalada: esquece a identidade antiga dela. */
    forgetKey(host: string): Promise<boolean> {
      return ipcRenderer.invoke('host:forget-key', host)
    },
    /** Entra no servidor recém-instalado (endereço público) e reabre o app. */
    finish(): Promise<boolean> {
      return ipcRenderer.invoke('host:finish')
    },
    onEvent(cb: (event: HostEvent) => void): () => void {
      const listener = (_e: unknown, event: HostEvent): void => cb(event)
      ipcRenderer.on('host:event', listener)
      return () => ipcRenderer.removeListener('host:event', listener)
    }
  },
  appMetrics: {
    sample(reset = false): Promise<AppMetrics | null> {
      return ipcRenderer.invoke('app-metrics:sample', reset)
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
    /** A janela compartilhada sumiu da tela (minimizada): a live congela. */
    onWindowHidden(cb: () => void): () => void {
      const listener = (): void => cb()
      ipcRenderer.on('screen-share:window-hidden', listener)
      return () => ipcRenderer.removeListener('screen-share:window-hidden', listener)
    },
    /** O compartilhamento acabou: para de vigiar a janela. */
    ended(): void {
      ipcRenderer.send('screen-share:ended')
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
    current(): Promise<{ name: string; startedAt: number; appId?: number; iconHash?: string } | null> {
      return ipcRenderer.invoke('games:current')
    },
    /** O jogo em andamento mudou (null = parou). Retorna unsubscribe. */
    onChange(cb: (game: { name: string; startedAt: number; appId?: number; iconHash?: string } | null) => void): () => void {
      const listener = (_e: unknown, game: { name: string; startedAt: number; appId?: number; iconHash?: string } | null): void =>
        cb(game)
      ipcRenderer.on('games:current', listener)
      return () => ipcRenderer.removeListener('games:current', listener)
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
  overlay: {
    /** Overlay de jogo existe nesta plataforma (só Windows). */
    supported: process.platform === 'win32',
    /** Renderer principal → main: estado atual da call para o overlay. */
    setState(snapshot: OverlaySnapshot): void {
      ipcRenderer.send('overlay:state', snapshot)
    },
    /**
     * Página do overlay: avisa que carregou (chamar depois de assinar onUpdate e
     * onEditing) e recebe o último estado e se está no modo de edição.
     */
    ready(): Promise<{
      snapshot: OverlaySnapshot | null
      editing: boolean
      frame: OverlayFrame | null
    }> {
      return ipcRenderer.invoke('overlay:ready')
    },
    /** Página do overlay: onde a janela está na área de trabalho (muda ao mover/editar). */
    onFrame(cb: (frame: OverlayFrame) => void): () => void {
      const listener = (_e: unknown, frame: OverlayFrame): void => cb(frame)
      ipcRenderer.on('overlay:frame', listener)
      return () => ipcRenderer.removeListener('overlay:frame', listener)
    },
    /** Página do overlay: tamanho medido da lista, para a janela ficar só em volta dela. */
    reportBox(size: { width: number; height: number }): void {
      ipcRenderer.send('overlay:box', size)
    },
    /** Página do overlay: novos estados. */
    onUpdate(cb: (snapshot: OverlaySnapshot) => void): () => void {
      const listener = (_e: unknown, snapshot: OverlaySnapshot): void => cb(snapshot)
      ipcRenderer.on('overlay:update', listener)
      return () => ipcRenderer.removeListener('overlay:update', listener)
    },
    /** Página do overlay: modo de edição (Shift+Tab) ligado/desligado. */
    onEditing(cb: (editing: boolean) => void): () => void {
      const listener = (_e: unknown, editing: boolean): void => cb(editing)
      ipcRenderer.on('overlay:editing', listener)
      return () => ipcRenderer.removeListener('overlay:editing', listener)
    },
    /** Página do overlay: posição/tamanho novos, ao soltar o mouse. */
    saveLayout(layout: OverlayLayout): void {
      ipcRenderer.send('overlay:layout', layout)
    },
    /** Configurações: o atalho está livre? null = atalho inválido. */
    checkShortcut(accelerator: string): Promise<{ accelerator: string; taken: boolean } | null> {
      return ipcRenderer.invoke('overlay:check-shortcut', accelerator)
    },
    /** Configurações: resultado de segurar o atalho no jogo (outro programa pode ter). */
    onShortcutStatus(cb: (status: { accelerator: string; taken: boolean }) => void): () => void {
      const listener = (_e: unknown, status: { accelerator: string; taken: boolean }): void =>
        cb(status)
      ipcRenderer.on('overlay:shortcut-status', listener)
      return () => ipcRenderer.removeListener('overlay:shortcut-status', listener)
    },
    /** Renderer principal: posição/tamanho editados no jogo, para salvar. */
    onLayout(cb: (layout: OverlayLayout) => void): () => void {
      const listener = (_e: unknown, layout: OverlayLayout): void => cb(layout)
      ipcRenderer.on('overlay:layout', listener)
      return () => ipcRenderer.removeListener('overlay:layout', listener)
    }
  }
}

// Som da janela compartilhada: o MessagePort não passa pelo contextBridge,
// então vai ao mundo da página por window.postMessage (padrão do Electron).
ipcRenderer.on('screen-audio:port', (event) => {
  window.postMessage('concord:screen-audio-port', '*', event.ports)
})

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
