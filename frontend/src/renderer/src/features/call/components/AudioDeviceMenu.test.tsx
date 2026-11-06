import { afterEach, describe, expect, it, vi } from 'vitest'

const { pick } = vi.hoisted(() => {
  const state = {
    inputDeviceId: 'mic-2',
    outputDeviceId: 'sumiu',
    cameraId: 'cam-1',
    setInputDevice: () => {},
    setOutputDevice: () => {},
    setCameraDevice: () => {},
    openSettings: () => {},
    openBackground: () => {}
  }
  return { pick: (sel: (s: typeof state) => unknown): unknown => sel(state) }
})

vi.mock('../store/callStore', () => ({ useCallStore: pick }))
vi.mock('../store/videoSettingsStore', () => ({ useVideoSettingsStore: pick }))
vi.mock('../../settings/store/settingsStore', () => ({ useSettingsStore: pick }))
vi.mock('../store/videoModalStore', () => ({ useVideoModalStore: pick }))
vi.mock('./DeviceVolume', () => ({ default: ({ kind }: { kind: string }) => <div data-volume={kind} /> }))
const canChoose = vi.hoisted(() => ({ output: true }))
vi.mock('../hooks/useAudioDevices', () => ({
  get CAN_CHOOSE_OUTPUT() {
    return canChoose.output
  },
  useAudioDevices: () => [
    { kind: 'audioinput', deviceId: 'mic-1', label: 'Headset' },
    { kind: 'audioinput', deviceId: 'mic-2', label: '' },
    { kind: 'audiooutput', deviceId: 'fone-1', label: 'Caixa' },
    { kind: 'videoinput', deviceId: 'cam-1', label: 'Webcam' }
  ]
}))
// Sem DOM: o portal vira o próprio conteúdo.
vi.mock('react-dom', async (original) => ({
  ...(await original<typeof import('react-dom')>()),
  createPortal: (node: React.ReactNode) => node
}))

import { renderToStaticMarkup } from 'react-dom/server'
import AudioDeviceMenu, { type AudioDeviceKind } from './AudioDeviceMenu'

function render(kind: AudioDeviceKind, viewportWidth = 1280): string {
  vi.stubGlobal('window', { innerWidth: viewportWidth, innerHeight: 800 })
  vi.stubGlobal('document', { body: {} })
  const anchor = {
    getBoundingClientRect: () => ({ right: 300, top: 700 }),
    contains: () => false
  } as unknown as HTMLElement
  return renderToStaticMarkup(<AudioDeviceMenu kind={kind} anchor={anchor} onClose={() => {}} />)
}

describe('AudioDeviceMenu', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    canChoose.output = true
  })

  it('entrada: lista os microfones, marca o escolhido (sem nome vira número) e mostra o volume', () => {
    const html = render('input')
    expect(html).toContain('aria-label="Dispositivo de entrada"')
    expect(html).toContain('Padrão do sistema')
    expect(html).toContain('Headset')
    expect(html).toMatch(/aria-checked="true"[^>]*title="Dispositivo 2"/)
    expect(html).toContain('data-volume="input"')
    expect(html).toContain('Configurações de voz')
    expect(html).not.toContain('Mudar fundo de vídeo')
  })

  it('saída desconectada: marca o padrão do sistema', () => {
    const html = render('output')
    expect(html).toMatch(/aria-checked="true"[^>]*title="Padrão do sistema"/)
    expect(html).toContain('Caixa')
  })

  it('navegador sem setSinkId: avisa que não dá para escolher a saída', () => {
    canChoose.output = false
    const html = render('output')
    expect(html).toContain('Este navegador não deixa escolher a saída de áudio.')
    expect(html).not.toContain('menuitemradio')
  })

  it('câmera: sem volume, com fundo de vídeo e as configurações de vídeo', () => {
    const html = render('camera')
    expect(html).toMatch(/aria-checked="true"[^>]*title="Webcam"/)
    expect(html).not.toContain('data-volume')
    expect(html).toContain('Mudar fundo de vídeo')
    expect(html).toContain('Configurações de vídeo')
  })

  it('fica acima da setinha e dentro da janela', () => {
    expect(render('input')).toContain('width:260px;left:40px;bottom:108px')
    expect(render('input', 300)).toContain('left:32px')
  })
})
