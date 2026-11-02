import { describe, expect, it } from 'vitest'
import {
  codecImplementation,
  limitationLabel,
  livePauseReason,
  screenStatsView,
  type ScreenStatsInput
} from './screenStats'

type Stat = Record<string, unknown> & { id: string; type: string }

function report(...stats: Stat[]): RTCStatsReport {
  return new Map(stats.map((s) => [s.id, s])) as unknown as RTCStatsReport
}

const h264: Stat = { id: 'c1', type: 'codec', mimeType: 'video/H264' }
const vp8: Stat = { id: 'c2', type: 'codec', mimeType: 'video/VP8' }

function outbound(extra: Record<string, unknown>): Stat {
  return {
    id: 'o1',
    type: 'outbound-rtp',
    kind: 'video',
    codecId: 'c1',
    timestamp: 1000,
    bytesSent: 0,
    framesEncoded: 0,
    qpSum: 0,
    ...extra
  }
}

function inbound(extra: Record<string, unknown>): Stat {
  return {
    id: 'i1',
    type: 'inbound-rtp',
    kind: 'video',
    codecId: 'c1',
    timestamp: 1000,
    bytesReceived: 0,
    packetsReceived: 0,
    packetsLost: 0,
    ...extra
  }
}

function sender(stats: Stat[], requestedFps: number | null = 30): ScreenStatsInput {
  return {
    local: true,
    report: report(...stats),
    enabled: true,
    streamState: 'active',
    requestedFps
  }
}

function receiver(stats: Stat[], extra: Partial<ScreenStatsInput> = {}): ScreenStatsInput {
  return {
    local: false,
    report: report(...stats),
    enabled: true,
    streamState: 'active',
    requestedFps: null,
    ...extra
  }
}

const value = (view: ReturnType<typeof screenStatsView>['view'], label: string) =>
  view.rows.find((row) => row.label === label)?.value

describe('codecImplementation', () => {
  it.each([
    ['MediaFoundationVideoEncodeAccelerator', undefined, 'Hardware'],
    ['VaapiVideoEncodeAccelerator', undefined, 'Hardware'],
    ['ExternalEncoder', undefined, 'Hardware'],
    ['D3D11VideoDecoder', undefined, 'Hardware'],
    ['libvpx', undefined, 'Software'],
    ['OpenH264', undefined, 'Software'],
    ['FFmpeg', undefined, 'Software'],
    ['SimulcastEncoderAdapter (libvpx, libvpx)', undefined, 'Software'],
    ['libvpx (fallback from: ExternalEncoder)', undefined, 'Software'],
    ['qualquer', true, 'Hardware'],
    ['ExternalEncoder', false, 'Software']
  ])('%s (eficiente: %s) → %s', (name, powerEfficient, kind) => {
    expect(codecImplementation(name, powerEfficient)).toBe(`${kind} · ${name}`)
  })

  it('sem nome nem pista: nada a mostrar', () => {
    expect(codecImplementation(undefined, undefined)).toBe('—')
    expect(codecImplementation('desconhecido', undefined)).toBe('desconhecido')
  })
})

describe('limitationLabel', () => {
  it.each([
    ['none', 'Nenhuma'],
    ['cpu', 'CPU'],
    ['bandwidth', 'Banda'],
    ['other', 'Outra'],
    [undefined, '—']
  ])('%s → %s', (reason, label) => {
    expect(limitationLabel(reason)).toBe(label)
  })
})

describe('livePauseReason', () => {
  it('desligado por mim vem antes da pausa do servidor', () => {
    expect(livePauseReason(false, 'paused')).toBe('offscreen')
    expect(livePauseReason(true, 'paused')).toBe('connection')
    expect(livePauseReason(true, 'active')).toBeNull()
  })
})

describe('screenStatsView — quem transmite', () => {
  it('H.264 por hardware: fps enviado vs pedido, resolução, Mbps e QP médio', () => {
    const first = screenStatsView(
      sender([h264, outbound({ bytesSent: 0, framesEncoded: 0, qpSum: 0 })], 60),
      null
    )
    expect(value(first.view, 'Taxa')).toBe('—')
    const { view } = screenStatsView(
      sender(
        [
          h264,
          outbound({
            timestamp: 2000,
            bytesSent: 1_000_000,
            framesEncoded: 60,
            qpSum: 1560,
            framesPerSecond: 58.6,
            frameWidth: 1920,
            frameHeight: 1080,
            encoderImplementation: 'MediaFoundationVideoEncodeAccelerator',
            powerEfficientEncoder: true,
            qualityLimitationReason: 'none'
          })
        ],
        60
      ),
      first.sample
    )
    expect(view.status).toBeNull()
    expect(view.rows).toEqual([
      { label: 'Quadros', value: '59 de 60 fps' },
      { label: 'Resolução', value: '1920×1080' },
      { label: 'Taxa', value: '8 Mbps' },
      { label: 'Codec', value: 'H.264 · placa de vídeo' },
      { label: 'Codificador', value: 'Hardware · MediaFoundationVideoEncodeAccelerator' },
      { label: 'Limitação', value: 'Nenhuma' },
      { label: 'QP médio', value: '26' },
      { label: 'Quadros-chave/PLI', value: '—' },
      { label: 'NACK', value: '—' }
    ])
  })

  it('VP8 por software limitado por CPU; sem QP não mostra a linha', () => {
    const first = screenStatsView(
      sender([vp8, outbound({ codecId: 'c2', qpSum: undefined })]),
      null
    )
    const { view } = screenStatsView(
      sender([
        vp8,
        outbound({
          codecId: 'c2',
          timestamp: 3000,
          bytesSent: 500_000,
          framesEncoded: 40,
          qpSum: undefined,
          framesPerSecond: 20,
          frameWidth: 1280,
          frameHeight: 720,
          encoderImplementation: 'libvpx',
          qualityLimitationReason: 'cpu'
        })
      ]),
      first.sample
    )
    expect(value(view, 'Quadros')).toBe('20 de 30 fps')
    expect(value(view, 'Taxa')).toBe('2 Mbps')
    expect(value(view, 'Codec')).toBe('VP8 · processador')
    expect(value(view, 'Codificador')).toBe('Software · libvpx')
    expect(value(view, 'Limitação')).toBe('CPU')
    expect(value(view, 'QP médio')).toBeUndefined()
  })

  it('limitado por banda, com taxa abaixo de 1 Mbps', () => {
    const first = screenStatsView(sender([h264, outbound({})]), null)
    const { view } = screenStatsView(
      sender([
        h264,
        outbound({ timestamp: 2000, bytesSent: 26_000, qualityLimitationReason: 'bandwidth' })
      ]),
      first.sample
    )
    expect(value(view, 'Limitação')).toBe('Banda')
    expect(value(view, 'Taxa')).toBe('0,2 Mbps')
  })

  it('H.265 na placa de vídeo: codec e onde codifica', () => {
    const h265: Stat = { id: 'c3', type: 'codec', mimeType: 'video/H265' }
    const { view } = screenStatsView(
      sender([
        h265,
        outbound({ codecId: 'c3', encoderImplementation: 'MediaFoundationVideoEncodeAccelerator' })
      ]),
      null
    )
    expect(value(view, 'Codec')).toBe('H.265 · placa de vídeo')
  })

  it('regressão: a live trocou de codec porque o publicado falhou → aviso no topo', () => {
    const vp8: Stat = { id: 'c4', type: 'codec', mimeType: 'video/H264' }
    const { view } = screenStatsView(
      { ...sender([vp8, outbound({ codecId: 'c4' })]), codecFallback: { from: 'h265', to: 'h264' } },
      null
    )
    expect(view.status).toBe('H.265 falhou, usando H.264')
    const vp8Only = screenStatsView(
      { ...sender([vp8, outbound({ codecId: 'c4' })]), codecFallback: { from: 'h264', to: 'vp8' } },
      null
    )
    expect(vp8Only.view.status).toBe('H.264 falhou, usando VP8')
  })

  it('codec de reserva publicando: lê o envio que está ativo', () => {
    const { view } = screenStatsView(
      sender([
        h264,
        vp8,
        outbound({ id: 'o1', active: false, bytesSent: 9_000_000 }),
        outbound({ id: 'o2', codecId: 'c2', bytesSent: 10 })
      ]),
      null
    )
    expect(value(view, 'Codec')).toBe('VP8')
  })

  it('reserva saindo junto com o principal: linha própria com codec, onde roda, tamanho e fps', () => {
    const h265: Stat = { id: 'c3', type: 'codec', mimeType: 'video/H265' }
    const { view } = screenStatsView(
      sender([
        h265,
        h264,
        outbound({
          id: 'o1',
          codecId: 'c3',
          bytesSent: 9_000_000,
          encoderImplementation: 'MediaFoundationVideoEncodeAccelerator',
          powerEfficientEncoder: true
        }),
        outbound({
          id: 'o2',
          bytesSent: 10,
          frameHeight: 720,
          framesPerSecond: 29.7,
          powerEfficientEncoder: false
        })
      ]),
      null
    )
    expect(value(view, 'Codec')).toBe('H.265 · placa de vídeo')
    expect(value(view, 'Reserva')).toBe('H.264 · processador · 720p 30 fps')
  })

  it('quadros-chave enviados e PLI recebidos (cada PLI pede um quadro-chave)', () => {
    const { view } = screenStatsView(
      sender([h264, outbound({ keyFramesEncoded: 7, pliCount: 6, nackCount: 2 })]),
      null
    )
    expect(value(view, 'Quadros-chave/PLI')).toBe('7 / 6')
    expect(value(view, 'NACK')).toBe('2')
  })

  it('envio pausado porque ninguém está assistindo: diz isso em vez de "Ainda sem dados"', () => {
    // Regressão: o dynacast pausa a camada (active: false) quando ninguém vê a
    // live; o painel descartava o envio e mostrava só "Ainda sem dados".
    const { view } = screenStatsView(
      sender([h264, outbound({ active: false, bytesSent: 5_000_000 })], 60),
      null
    )
    expect(view.status).toBe('Envio pausado: ninguém está vendo a live agora')
    expect(value(view, 'Codec')).toBe('H.264')
    expect(value(view, 'Quadros')).toBe('0 de 60 fps')
  })

  it('mostra o degrau saindo e por que desceu', () => {
    const input = sender([h264, outbound({})], 60)
    const reduced = {
      chosen: '1080p 60',
      effective: '720p 60',
      reduced: true,
      reason: 'bandwidth' as const,
      step: 1
    }
    expect(value(screenStatsView({ ...input, quality: reduced }, null).view, 'Qualidade')).toBe(
      '720p 60 (de 1080p 60, pela conexão)'
    )
    const cpuFloor = { ...reduced, effective: '720p 30', reason: 'cpu' as const }
    expect(value(screenStatsView({ ...input, quality: cpuFloor }, null).view, 'Qualidade')).toBe(
      '720p 30 (de 1080p 60, pelo PC)'
    )
    const full = { ...reduced, effective: '1080p 60', reduced: false, reason: null, step: 0 }
    expect(value(screenStatsView({ ...input, quality: full }, null).view, 'Qualidade')).toBe(
      '1080p 60'
    )
    expect(value(screenStatsView(input, null).view, 'Qualidade')).toBeUndefined()
  })

  it('sem vídeo saindo ainda', () => {
    const { view, sample } = screenStatsView(sender([]), null)
    expect(view.rows).toEqual([])
    expect(view.status).toBe('Ainda sem dados')
    expect(sample).toBeNull()
  })
})

describe('screenStatsView — quem assiste', () => {
  it('fps, resolução, Mbps, decodificador, perda e jitter, descartes e congelamentos', () => {
    const first = screenStatsView(receiver([h264, inbound({})]), null)
    const { view } = screenStatsView(
      receiver([
        h264,
        inbound({
          timestamp: 2000,
          bytesReceived: 500_000,
          packetsReceived: 995,
          packetsLost: 5,
          jitter: 0.012,
          framesPerSecond: 30,
          frameWidth: 1920,
          frameHeight: 1080,
          decoderImplementation: 'D3D11VideoDecoder',
          powerEfficientDecoder: true,
          framesDropped: 3,
          freezeCount: 2,
          totalFreezesDuration: 1.25
        })
      ]),
      first.sample
    )
    expect(view.status).toBeNull()
    expect(view.rows).toEqual([
      { label: 'Quadros', value: '30 fps' },
      { label: 'Resolução', value: '1920×1080' },
      { label: 'Taxa', value: '4 Mbps' },
      { label: 'Codec', value: 'H.264' },
      { label: 'Codificado', value: '—' },
      { label: 'Saindo em', value: '—' },
      { label: 'Decodificador', value: 'Hardware · D3D11VideoDecoder' },
      { label: 'Perda', value: '0,5%' },
      { label: 'Jitter', value: '12 ms' },
      { label: 'Descartados', value: '3' },
      { label: 'Congelamentos', value: '2 (1,3 s)' },
      { label: 'Quadros-chave/PLI', value: '—' },
      { label: 'NACK', value: '—' },
      { label: 'Fora de ordem', value: '—' },
      { label: 'Buffer', value: '—' }
    ])
  })

  it('codec: onde quem transmite codifica, não o meu decodificador (Linux decodificando por software)', () => {
    const { view } = screenStatsView(
      receiver(
        [
          h264,
          inbound({
            decoderImplementation: 'FFmpeg',
            powerEfficientDecoder: false
          })
        ],
        {
          encoder: {
            quality: '1080p 30',
            encoders: [
              { codec: 'H265', hardware: true, height: 1080, fps: 30, backup: false },
              { codec: 'H264', hardware: true, height: 720, fps: 30, backup: true }
            ]
          }
        }
      ),
      null
    )
    expect(value(view, 'Codec')).toBe('H.264')
    expect(value(view, 'Codificado')).toBe('Na placa de vídeo')
    expect(value(view, 'Saindo em')).toBe('720p 30 (reserva)')
    expect(value(view, 'Decodificador')).toBe('Software · FFmpeg')
  })

  it('diagnóstico de congelamento: quadros-chave/PLI, NACK, pacotes fora de hora e buffer', () => {
    const { view } = screenStatsView(
      receiver([
        h264,
        inbound({
          keyFramesDecoded: 12,
          pliCount: 9,
          firCount: 1,
          nackCount: 40,
          packetsDiscarded: 3,
          jitterBufferDelay: 9,
          jitterBufferEmittedCount: 100
        })
      ]),
      null
    )
    expect(value(view, 'Quadros-chave/PLI')).toBe('12 / 10')
    expect(value(view, 'NACK')).toBe('40')
    expect(value(view, 'Fora de ordem')).toBe('3')
    expect(value(view, 'Buffer')).toBe('90 ms')
  })

  it('decodificando por software com NVIDIA sem driver: nota com o que instalar', () => {
    const hint = 'Instale o nvidia-vaapi-driver para usar a placa de vídeo'
    const software = inbound({ decoderImplementation: 'FFmpeg', powerEfficientDecoder: false })
    const hardware = inbound({
      decoderImplementation: 'VaapiVideoDecoder',
      powerEfficientDecoder: true
    })
    expect(screenStatsView(receiver([h264, software], { driverHint: hint }), null).view.note).toBe(
      hint
    )
    expect(
      screenStatsView(receiver([h264, hardware], { driverHint: hint }), null).view.note
    ).toBeNull()
    expect(screenStatsView(receiver([h264, software]), null).view.note).toBeNull()
  })

  it('perda só do intervalo (não acumulada desde o início)', () => {
    const first = screenStatsView(
      receiver([h264, inbound({ packetsReceived: 900, packetsLost: 100 })]),
      null
    )
    const { view } = screenStatsView(
      receiver([h264, inbound({ timestamp: 2000, packetsReceived: 1900, packetsLost: 100 })]),
      first.sample
    )
    expect(value(view, 'Perda')).toBe('0%')
  })

  it('vídeo desligado por estar fora de vista', () => {
    const { view } = screenStatsView(
      receiver([h264, inbound({})], { enabled: false, streamState: 'paused' }),
      null
    )
    expect(view.status).toBe('Vídeo pausado (fora de vista)')
  })

  it('pausada pelo servidor por causa da conexão', () => {
    const { view } = screenStatsView(receiver([], { streamState: 'paused' }), null)
    expect(view.status).toBe('Pausada pela sua conexão')
  })
})
