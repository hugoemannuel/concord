// Codec da live (vídeo da tela). Automático: sempre na placa de vídeo, do
// melhor para o pior — AV1 → H.265 → H.264 —, depois H.264 pelo processador e,
// por último, VP8. AV1 e H.265 por software nunca (pesados demais). AV1/H.265
// levam H.264 de reserva (todo mundo decodifica); H.264 leva VP8. Escolher um
// codec em Avançado começa a ordem por ele. AV1 e H.265 saem numa camada só:
// a de 720p de quem tem internet fraca é a reserva H.264. Ver docs/adr/0015,
// 0019 e 0048.

import type { ScreenCodecSupport, ScreenVideoCodec } from './screenCodecSupport'

export type ScreenCodecPreference = 'auto' | ScreenVideoCodec

export const SCREEN_CODEC_KEY = 'salinha:screen-share-codec'

/**
 * Flag de teste (ADR 0048): '1' deixa o H.265 sair com a camada extra de 720p.
 * Sem ela, com a camada extra o H.265 é pulado como o AV1 (as duas camadas no
 * codificador da placa caíam sozinhas para VP8: tela preta para quem assiste).
 */
export const H265_LAYER_KEY = 'salinha:screen-h265-720p-extra'

/** Codecs que não saem com a camada extra de 720p. */
export function singleLayerCodecs(): ScreenVideoCodec[] {
  try {
    if (localStorage.getItem(H265_LAYER_KEY) === '1') return ['av1']
  } catch {
    /* Sem armazenamento local: o padrão. */
  }
  return ['av1', 'h265']
}

export interface ScreenCodecOptions {
  videoCodec: ScreenVideoCodec
  backupCodec: false | { codec: 'h264' | 'vp8' }
}

/** Do melhor para o pior. */
export const CODEC_ORDER: readonly ScreenVideoCodec[] = ['av1', 'h265', 'h264', 'vp8']

/** O que dá para usar: AV1/H.265 só na placa; H.264 também no processador; VP8 sempre. */
export function codecChoices(support: ScreenCodecSupport): Record<ScreenVideoCodec, boolean> {
  return {
    av1: support.av1 === 'hardware',
    h265: support.h265 === 'hardware',
    h264: support.h264 !== null,
    vp8: true
  }
}

function backupFor(
  codec: ScreenVideoCodec,
  support: ScreenCodecSupport
): ScreenCodecOptions['backupCodec'] {
  if (codec === 'vp8') return false
  if (codec === 'h264' || support.h264 === null) return { codec: 'vp8' }
  return { codec: 'h264' }
}

/**
 * `simulcast`: com a camada extra de 720p pula AV1 e H.265 (singleLayerCodecs).
 * `failed`: codecs que já trocaram sozinhos nesta live (ver screenCodecGuard).
 */
export function screenCodecOptions(
  preference: ScreenCodecPreference,
  support: ScreenCodecSupport,
  simulcast = false,
  failed: readonly ScreenVideoCodec[] = []
): ScreenCodecOptions {
  const usable = codecChoices(support)
  const skipped = [...failed, ...(simulcast ? singleLayerCodecs() : [])]
  skipped.forEach((codec) => (usable[codec] = codec === 'vp8'))
  const start = preference === 'auto' ? 0 : CODEC_ORDER.indexOf(preference)
  const videoCodec = CODEC_ORDER.slice(start).find((codec) => usable[codec]) ?? 'vp8'
  return { videoCodec, backupCodec: backupFor(videoCodec, support) }
}

const PREFERENCES: readonly string[] = ['auto', ...CODEC_ORDER]

export function loadScreenCodec(): ScreenCodecPreference {
  try {
    const value = localStorage.getItem(SCREEN_CODEC_KEY)
    return value && PREFERENCES.includes(value) ? (value as ScreenCodecPreference) : 'auto'
  } catch {
    return 'auto'
  }
}

export function saveScreenCodec(preference: ScreenCodecPreference): void {
  try {
    localStorage.setItem(SCREEN_CODEC_KEY, preference)
  } catch {
    /* Compartilhar continua funcionando sem armazenamento local. */
  }
}
