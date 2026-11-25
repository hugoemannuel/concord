import { app, ipcMain, powerMonitor, type BrowserWindow } from 'electron'
import { readFileSync } from 'node:fs'
import { cpus, freemem, loadavg, totalmem } from 'node:os'
import { gpuStatusOf } from '../../shared/deviceStats'
import { DeviceSampler, type SamplerDeps } from './deviceSampler'
import { HelperSampler } from './linuxHelpers'

// Métricas do aparelho (docs/adr/0069): o renderer leva o agregado por
// device-stats:take e marca a abertura com device-stats:usable.

type GetWindow = () => BrowserWindow | null

interface IpcSender {
  sender: unknown
  senderFrame: unknown
}

interface WindowLike {
  isDestroyed(): boolean
  webContents: { mainFrame: unknown }
}

/** Mesma checagem do app-metrics:sample: só o quadro principal da janela principal. */
export function fromMainFrame(event: IpcSender, win: WindowLike | null): boolean {
  if (!win || win.isDestroyed()) return false
  return event.sender === win.webContents && event.senderFrame === win.webContents.mainFrame
}

/** O processo da GPU caiu (não um encerramento normal). */
export function isGpuCrash(details: { type: string; reason: string }): boolean {
  return details.type === 'GPU' && details.reason !== 'clean-exit'
}

function readProc(path: string): string | null {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

function samplerDeps(platform: NodeJS.Platform): SamplerDeps {
  return {
    appMetrics: () => app.getAppMetrics(),
    cpus: () => cpus(),
    freeMem: () => freemem(),
    totalMem: () => totalmem(),
    // No Windows o loadavg() é sempre [0, 0, 0]: não existe.
    loadAvg: () => (platform === 'win32' ? null : loadavg()[0]),
    onBattery: () => powerMonitor.isOnBatteryPower(),
    helpers: platform === 'linux' ? new HelperSampler(process.pid, readProc) : null,
    gpuStatus: () =>
      gpuStatusOf(app.getGPUFeatureStatus().gpu_compositing, app.isHardwareAccelerationEnabled()),
    now: () => performance.now(),
    every: (ms, fn) => {
      const timer = setInterval(fn, ms)
      return () => clearInterval(timer)
    },
    cores: cpus().length
  }
}

/** Eventos só contam: travada da janela principal, GPU que caiu, limite de velocidade. */
function watchEvents(sampler: DeviceSampler, getWindow: GetWindow): void {
  app.on('browser-window-created', (_event, win) => {
    win.on('unresponsive', () => {
      if (win === getWindow()) sampler.noteHang()
    })
  })
  app.on('child-process-gone', (_event, details) => {
    if (isGpuCrash(details)) sampler.noteGpuCrash()
  })
  powerMonitor.on('speed-limit-change', (details) => sampler.noteSpeedLimit(details.limit))
}

/** Chamar no whenReady, antes de criar a janela principal (para ver o browser-window-created). */
export function setupDeviceStats(getWindow: GetWindow): void {
  const sampler = new DeviceSampler(samplerDeps(process.platform))
  watchEvents(sampler, getWindow)
  ipcMain.handle('device-stats:take', (event) =>
    fromMainFrame(event, getWindow()) ? sampler.take() : null
  )
  ipcMain.on('device-stats:usable', (event) => {
    if (fromMainFrame(event, getWindow())) sampler.markUsable(process.uptime() * 1000)
  })
}
