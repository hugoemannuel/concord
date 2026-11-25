import type { LinuxGpu } from './linuxGpu'

// Features do Chromium ligadas/desligadas no boot (captura de tela e vídeo
// por placa de vídeo). Uma lista só por switch: o Chromium lê apenas o último
// --enable-features, então duas chamadas de appendSwitch se sobrescrevem.
// Ver docs/adr/0020-qualidade-das-lives.md.

/** Captura WGC (janela coberta continua entregando quadros). */
const CAPTURE = ['AllowWgcWindowCapturer', 'AllowWgcScreenCapturer']

/**
 * Codificar/decodificar na placa de vídeo. Windows: H.264 por Media Foundation
 * e decodificação D3D11 já vêm ligados; o AV1 por hardware no WebRTC vem
 * desligado, e o LiveKit publica tela em AV1 com L1T3 (o D3D12 só faz L1T3
 * com a feature). Linux: a codificação VA-API vem desligada.
 */
const HARDWARE_VIDEO: Partial<Record<NodeJS.Platform, string[]>> = {
  win32: ['WebRtcAV1HWEncode', 'D3D12VideoEncodeAcceleratorL1T3'],
  linux: ['AcceleratedVideoEncoder', 'AcceleratedVideoDecoder']
}

/**
 * Linux só com NVIDIA e o nvidia-vaapi-driver instalado: o Chromium recusa
 * VA-API em NVIDIA sem `VaapiOnNvidiaGPUs`, e o driver não passa nas checagens
 * de fabricante sem `VaapiIgnoreDriverChecks`; a decodificação vai pelo
 * caminho GL (ANGLE). Só decodifica (H.265 inclusive): o driver não codifica.
 */
const NVIDIA_VAAPI = [
  'VaapiOnNvidiaGPUs',
  'VaapiIgnoreDriverChecks',
  'AcceleratedVideoDecodeLinuxGL'
]

/** Oclusão nativa marca a janela coberta como oculta e congela a captura. */
const DISABLE = ['CalculateNativeWinOcclusion']

/**
 * Sem anunciar H.265 para receber no WebRTC (o vídeo comum segue igual): o
 * servidor manda a reserva H.264. Liga quando o H.265 chegou e não decodificou
 * neste aparelho (hevcDecodeMark, docs/adr/0073). Nome conferido no Chromium do
 * Electron 44: `rtc_video_decoder_factory.cc` só lista o H.265 com ela ligada.
 */
const NO_HEVC_RECEIVE = ['WebRtcAllowH265Receive']

export function chromiumFeatures(
  platform: NodeJS.Platform,
  /** Placa de vídeo no Linux (ver linuxGpu); null nas outras plataformas. */
  gpu: LinuxGpu | null = null,
  /** false = o H.265 recebido não decodificou aqui (marca vigente). */
  receiveHevc = true
): { enable: string; disable: string } {
  const nvidia = platform === 'linux' && gpu?.nvidiaVaapi ? NVIDIA_VAAPI : []
  return {
    enable: [...CAPTURE, ...(HARDWARE_VIDEO[platform] ?? []), ...nvidia].join(','),
    disable: [...DISABLE, ...(receiveHevc ? [] : NO_HEVC_RECEIVE)].join(',')
  }
}
