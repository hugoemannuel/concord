import { app, BrowserWindow, ipcMain, net } from 'electron'
import { autoUpdater } from 'electron-updater'
import { homedir } from 'os'
import { readFile, rm } from 'fs/promises'
import { realpathSync } from 'fs'
import { basename } from 'path'
import { isInCall, markQuitting } from '../window/background'
import {
  autoUpdateUnavailable,
  installOnStartup,
  isRefusedRelease,
  type ReleaseId
} from './updatePolicy'
import { createDownloadScheduler } from './downloadScheduler'
import { createUpdateCheckGate } from './updateCheck'
import { verifyInstaller } from './updateSignature'
import { clearCallResume, saveCallResume, takeCallResume } from './callResume'
import { validCallResume, type CallResume } from '../../shared/callResume'
import { logUpdate } from './updateLog'
import { sandboxNoticeReason, updateBackendKind } from './linuxInstall'
import { LinuxUpdater } from './linuxUpdater'
import {
  readRefused,
  readSandboxNoticeShown,
  readVerifiedVersion,
  saveRefused as writeRefused,
  saveSandboxNoticeShown,
  saveVerifiedVersion
} from './updateMarks'

// Atualização automática servida pelo próprio servidor da Salinha
// (`<servidor>/updates/`). O instalador só é aceito com a assinatura Ed25519
// do dono (chave pública embutida no build).
//
// Windows e AppImage montado: electron-updater. Linux sem AppImage (AppImage
// extraído, sem libfuse2, ou a instalação por usuário em ~/.local/share/salinha):
// linuxUpdater.ts, que baixa o .tar.gz assinado e não depende de nada do
// sistema. Os dois passam pelas mesmas regras (chamada, Atualizar, assinatura).
//
// Versão nova é baixada e verificada sozinha, em segundo plano (também em
// chamada; ver downloadScheduler.ts): quando a barra mostra "Atualizar" pronto,
// o clique só instala e reinicia.

// latest.yml tem poucas centenas de bytes: checar seguido não pesa. O caminho
// principal é o aviso do servidor (WS app:update → update:check-now); a
// checagem periódica é a rede de segurança.
const CHECK_INTERVAL_MS = 60_000
/** Linux: depois disso aberto, a versão nova "pegou" e o lançador não volta. */
const BOOT_CONFIRM_MS = 10_000

interface DownloadedUpdate {
  version: string
  downloadedFile: string
}

/** O que o electron-updater (UpdateInfo) e o LinuxUpdater mandam em update-available. */
interface AvailableUpdate {
  version: string
  /** arquivo, relativo ao endereço das atualizações */
  path?: string
  sha512?: string
  files?: Array<{ url?: string; sha512?: string }>
}

/** O que o updater usa do autoUpdater (e o LinuxUpdater também oferece). */
interface UpdateBackend {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string, listener: (...args: any[]) => void): unknown
  checkForUpdates(): Promise<unknown>
  downloadUpdate(): Promise<unknown>
  quitAndInstall(isSilent: boolean, isForceRunAfter: boolean): void
  /** Linux: extrai e confere o pacote (os bytes já com a assinatura válida). */
  stage?(event: DownloadedUpdate, data: Buffer): Promise<void>
  /** Linux: false = só com clique (migração, versão que já voltou atrás). */
  canAutoInstall?(version: string): boolean
}

let backend: UpdateBackend = autoUpdater

interface UpdaterConfig {
  /** ex.: http://abc.ply.gg:1234/updates/ */
  feedUrl: string
  publicKeyPem: string
}

const startedAt = Date.now()

function releaseId(info: AvailableUpdate): ReleaseId {
  return { version: info.version, sha512: info.sha512 ?? info.files?.[0]?.sha512 ?? '' }
}

function releaseFile(info: AvailableUpdate): string | null {
  const file = info.path ?? info.files?.[0]?.url
  return file && !file.includes('/') ? file : null
}
/** Versão nova encontrada (ainda baixando ou já pronta). */
let availableVersion: string | null = null
let refused: ReleaseId | null = null

function saveRefused(release: ReleaseId | null): void {
  refused = release
  writeRefused(release)
}
let feedUrl = ''
/** Linux fora do AppImage montado: o updater próprio está ativo. */
let linuxSelfUpdating = false
let sendToWindow: (channel: string, value: unknown) => void = () => {}
/** Versão baixada e com assinatura válida — pronta para instalar. */
let readyVersion: string | null = null
/** A pessoa clicou em Atualizar: instala assim que terminar de baixar. */
let installRequested = false
let callSnapshot: CallResume | null = null
let installing = false

function install(onError: (message: string) => void): void {
  if (installing) return
  try {
    saveCallResume(callSnapshot)
  } catch (error) {
    logUpdate('não foi possível salvar a chamada', error)
    onError('Não foi possível salvar a chamada antes de atualizar. Tente novamente.')
    return
  }
  installing = true
  markQuitting()
  // silencioso e abre o app de novo ao terminar
  try {
    backend.quitAndInstall(true, true)
  } catch (error) {
    installing = false
    markQuitting(false)
    try {
      clearCallResume()
    } catch (cleanupError) {
      logUpdate('erro ao limpar retomada', cleanupError)
    }
    logUpdate('instalação falhou', error)
    onError('Não foi possível instalar a atualização.')
  }
}

async function fetchSignature(feedUrl: string, file: string): Promise<string> {
  const response = await net.fetch(new URL(`${encodeURIComponent(file)}.sig`, feedUrl).toString())
  if (!response.ok) throw new Error(`assinatura não encontrada (${response.status})`)
  return response.text()
}

const REFUSED_MESSAGE = 'A atualização baixada não passou na verificação de segurança.'
const SIGNATURE_UNAVAILABLE_MESSAGE =
  'Não foi possível conferir a atualização agora. Tente mais tarde.'

const downloads = createDownloadScheduler({
  download: () => backend.downloadUpdate(),
  fetchSignature: (file) => fetchSignature(feedUrl, file),
  wanted: () => !!availableVersion && !readyVersion && !refusedOffer(),
  // Falhou (rede, assinatura indisponível): espera cada vez mais antes de tentar,
  // e a barra deixa de mostrar o progresso do download que parou.
  onFailure: (message, error, retryInMs) => {
    logUpdate(`${message} (nova tentativa em ${Math.round(retryInMs / 60_000)} min)`, error)
    sendToWindow('update:progress', 0)
  },
  onSignatureUnavailable: () => {
    if (!installRequested) return
    installRequested = false
    sendToWindow('update:error', SIGNATURE_UNAVAILABLE_MESSAGE)
  },
  startedAt
})

/** O manifesto oferece agora exatamente o par versão + sha512 recusado. */
function refusedOffer(): boolean {
  const release = downloads.release()
  return !!release && isRefusedRelease(refused, release)
}

/** Baixa a versão disponível. `force`: a pessoa clicou em Atualizar (sem sorteio nem espera). */
function startDownload(force = false): void {
  if (readyVersion || !availableVersion) return
  if (refusedOffer()) {
    if (force) {
      installRequested = false
      sendToWindow('update:error', REFUSED_MESSAGE)
    }
    return
  }
  downloads.request(force)
}

/** Falha passageira (rede, .sig no meio do deploy): o download fica. */
async function downloadedSignature(file: string): Promise<string | null> {
  try {
    return downloads.signatureFor(file) ?? (await fetchSignature(feedUrl, file))
  } catch (err) {
    downloads.failed('assinatura indisponível', err)
    installRequested = false
    sendToWindow('update:error', SIGNATURE_UNAVAILABLE_MESSAGE)
    return null
  }
}

/**
 * Confere a assinatura Ed25519 do que foi baixado e, no Linux, extrai dos
 * mesmos bytes. Recusado: apaga, grava a recusa e avisa.
 */
async function verifyDownloaded(event: DownloadedUpdate, publicKeyPem: string): Promise<boolean> {
  const signature = await downloadedSignature(basename(event.downloadedFile))
  if (signature === null) return false
  try {
    const data = await readFile(event.downloadedFile)
    if (!verifyInstaller(data, signature, publicKeyPem)) {
      throw new Error('assinatura inválida')
    }
    // Só depois da assinatura: extrai (dos mesmos bytes conferidos) e
    // confere a versão dentro do pacote.
    if (backend.stage) await backend.stage(event, data)
    return true
  } catch (err) {
    logUpdate('instalador recusado', err)
    await rm(event.downloadedFile, { force: true }).catch(() => {})
    downloads.forgetSignature()
    const offered = downloads.release()
    saveRefused(
      offered?.version === event.version ? offered : { version: event.version, sha512: '' }
    )
    installRequested = false
    sendToWindow('update:error', REFUSED_MESSAGE)
    return false
  }
}

/** Baixada e verificada: instala se a pessoa pediu (ou ao abrir); senão avisa. */
function markReady(version: string): void {
  readyVersion = version
  const verifiedBefore = readVerifiedVersion()
  saveVerifiedVersion(version)
  const startup =
    installOnStartup({
      version,
      verifiedBefore,
      msSinceStart: Date.now() - startedAt,
      inCall: isInCall()
    }) && backend.canAutoInstall?.(version) !== false
  if (installRequested || startup) {
    install((message) => sendToWindow('update:error', message))
    return
  }
  sendToWindow('update:ready', version)
}

export function setupUpdater(getWindow: () => BrowserWindow | null, config: UpdaterConfig): void {
  const send = (channel: string, value: unknown): void =>
    getWindow()?.webContents.send(channel, value)
  sendToWindow = send
  feedUrl = config.feedUrl
  refused = readRefused()
  const installUpdate = (): void => install((message) => send('update:error', message))

  let pendingResume = takeCallResume()
  ipcMain.on('update:call-snapshot', (event, snapshot: unknown) => {
    if (event.sender !== getWindow()?.webContents) return
    callSnapshot = validCallResume(snapshot) ? snapshot : null
  })
  ipcMain.handle('update:take-call-resume', (event) => {
    if (event.sender !== getWindow()?.webContents) return null
    const pending = pendingResume
    pendingResume = null
    return pending
  })

  ipcMain.handle('update:current-version', () => app.getVersion())
  ipcMain.handle('update:status', () =>
    availableVersion
      ? { version: availableVersion, ready: readyVersion === availableVersion }
      : null
  )
  ipcMain.handle('update:unavailable', () =>
    autoUpdateUnavailable({
      platform: process.platform,
      isPackaged: app.isPackaged,
      appImage: process.env.APPIMAGE,
      selfUpdating: linuxSelfUpdating
    })
  )
  // Botão Atualizar: instala na hora se já baixou e verificou; senão baixa
  // agora (fura o sorteio e a espera) e instala quando terminar.
  ipcMain.on('update:install', (event) => {
    if (event.sender !== getWindow()?.webContents) return
    if (readyVersion) {
      installUpdate()
      return
    }
    installRequested = true
    startDownload(true)
  })

  // Linux: o lançador abriu sem o sandbox do Chromium — avisa uma vez.
  let sandboxNotice = sandboxNoticeReason(process.platform, process.env)
  ipcMain.handle('update:sandbox-notice', (event) => {
    if (event.sender !== getWindow()?.webContents || !sandboxNotice) return null
    const reason = sandboxNotice
    sandboxNotice = null
    if (readSandboxNoticeShown()) return null
    saveSandboxNoticeShown()
    return reason
  })

  // Sem endereço ou sem chave (build de desenvolvimento): não atualiza.
  if (!app.isPackaged || !config.feedUrl || !config.publicKeyPem) return

  let realExecPath = process.execPath
  try {
    realExecPath = realpathSync(process.execPath)
  } catch {
    // fica o caminho como veio
  }
  if (updateBackendKind(process.platform, process.env, realExecPath) === 'linux-managed') {
    const linux = new LinuxUpdater({
      feedUrl: config.feedUrl,
      currentVersion: app.getVersion(),
      execPath: process.execPath,
      home: homedir(),
      env: process.env,
      argv: process.argv.slice(1),
      fetch: (url) => net.fetch(url),
      relaunch: (options) => app.relaunch(options),
      quit: () => app.quit()
    })
    setTimeout(() => linux.confirmStartup(), BOOT_CONFIRM_MS)
    backend = linux
    linuxSelfUpdating = true
  } else {
    autoUpdater.setFeedURL({ provider: 'generic', url: config.feedUrl })
    autoUpdater.autoDownload = false
    // A instalação passa pela verificação da assinatura — nunca automática.
    autoUpdater.autoInstallOnAppQuit = false
    backend = autoUpdater
  }

  // Aviso assim que existe versão nova (antes de baixar); versão mais nova
  // substitui a que já estava pronta.
  backend.on('update-available', (info: AvailableUpdate) => {
    const offer = releaseId(info)
    downloads.offer(offer, releaseFile(info))
    if (isRefusedRelease(refused, offer)) return
    if (refused) saveRefused(null)
    if (info.version !== availableVersion) {
      availableVersion = info.version
      readyVersion = null
    }
    send('update:available', info.version)
    startDownload(installRequested)
  })
  backend.on('download-progress', (progress: { percent: number }) => {
    send('update:progress', Math.round(progress.percent))
  })
  backend.on('error', (err: unknown) => {
    if (installing) markQuitting(false)
    installing = false
    try {
      clearCallResume()
    } catch (error) {
      logUpdate('erro ao limpar retomada', error)
    }
    downloads.settled()
    logUpdate('erro', err)
    if (installRequested) send('update:error', String(err))
  })
  backend.on('update-downloaded', async (event: DownloadedUpdate) => {
    downloads.settled()
    // Saiu versão mais nova durante o download: baixa ela, não prepara a velha.
    if (availableVersion && event.version !== availableVersion) {
      startDownload(installRequested)
      return
    }
    if (!(await verifyDownloaded(event, config.publicKeyPem))) return
    downloads.succeeded()
    markReady(event.version)
  })

  const gate = createUpdateCheckGate(() =>
    backend.checkForUpdates().catch((err) => logUpdate('checagem falhou', err))
  )
  // O renderer pede na hora: o servidor avisou de versão nova (WS app:update)
  // ou o WS reconectou (deploy reinicia o backend; o manifesto pode sair depois).
  ipcMain.on('update:check-now', (event) => {
    if (event.sender !== getWindow()?.webContents) return
    gate.request()
  })
  gate.run()
  setInterval(gate.run, CHECK_INTERVAL_MS)
}
