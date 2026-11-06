import { describe, expect, it } from 'vitest'
import {
  canSwap,
  DUCK_GAIN,
  duckSettled,
  duckTarget,
  formatDuration,
  isMaestroChannel,
  isMaestroIdentity,
  isMaestroMessageKind,
  isMaestroQuiet,
  MAESTRO_USER_ID,
  MAESTRO_HOWTO,
  maestroIdentity,
  slashSuggestions,
  MUSIC_COMMANDS,
  splitBold,
  stepGain,
  videoSyncAction,
  wantsVideo,
  videoTargetSec
} from './music'
import type { MusicItem } from '../api/music'

const item = (id: string, user: string): MusicItem => ({
  id,
  video_id: 'x',
  title: id,
  artist: '',
  thumbnail: '',
  duration_ms: 1000,
  requested_by: { id: user, username: user, display_name: user },
  has_video: false,
  video_ready: false
})

describe('slashSuggestions', () => {
  it('lista os comandos ao digitar /', () => {
    expect(slashSuggestions('/').map((s) => s.command)).toEqual([
      '/play',
      '/skip',
      '/fila',
      '/help'
    ])
  })
  it('filtra pelo começo, incluindo aliases', () => {
    expect(slashSuggestions('/pu').map((s) => s.command)).toEqual(['/skip'])
    expect(slashSuggestions('/fi').map((s) => s.command)).toEqual(['/fila'])
  })
  it('lista os comandos que receber (ex.: /tts junto, ou só ele na DM)', () => {
    const tts = { command: '/tts', aliases: [], usage: '/tts <mensagem>', description: 'Lê' }
    expect(slashSuggestions('/t', [tts]).map((s) => s.command)).toEqual(['/tts'])
    expect(slashSuggestions('/', [...MUSIC_COMMANDS, tts])).toHaveLength(5)
    expect(slashSuggestions('/', [])).toEqual([])
  })
  it('some depois do espaço ou sem barra', () => {
    expect(slashSuggestions('/play queen')).toEqual([])
    expect(slashSuggestions('oi')).toEqual([])
  })
})

describe('MAESTRO_HOWTO', () => {
  it('cita todos os comandos que o /help ensina', () => {
    const text = MAESTRO_HOWTO.steps.join(' ')
    for (const cmd of ['/play', '/skip', '/fila', '/help']) expect(text).toContain(cmd)
  })
})

describe('formatação e regras', () => {
  it('formatDuration', () => {
    expect(formatDuration(355_000)).toBe('5:55')
    expect(formatDuration(3_723_000)).toBe('1:02:03')
  })
  it('identidade do bot', () => {
    expect(isMaestroIdentity('bot-music:abc')).toBe(true)
    expect(isMaestroIdentity('abc')).toBe(false)
    expect(maestroIdentity('v1')).toBe('bot-music:v1')
    expect(isMaestroIdentity(maestroIdentity('v1'))).toBe(true)
  })
  it('canSwap só entre duas músicas minhas', () => {
    expect(canSwap(item('a', 'me'), item('b', 'me'), 'me')).toBe(true)
    expect(canSwap(item('a', 'me'), item('b', 'other'), 'me')).toBe(false)
    expect(canSwap(item('a', 'me'), item('a', 'me'), 'me')).toBe(false)
  })
  it('splitBold', () => {
    expect(splitBold('🎵 @caio adicionou **Song** (5:55)')).toEqual([
      { text: '🎵 @caio adicionou ', bold: false },
      { text: 'Song', bold: true },
      { text: ' (5:55)', bold: false }
    ])
  })
})

describe('ducking', () => {
  it('abaixa quando outra pessoa fala e segura 600 ms', () => {
    const base = { meId: 'me', enabled: true, now: 10_000 }
    expect(duckTarget({ ...base, speakingIds: ['ana'], lastOtherSpeechAt: 10_000 })).toBe(DUCK_GAIN)
    expect(duckTarget({ ...base, speakingIds: ['me', 'bot-music:x'], lastOtherSpeechAt: 0 })).toBe(
      1
    )
    expect(duckTarget({ ...base, speakingIds: [], lastOtherSpeechAt: 9_600 })).toBe(DUCK_GAIN)
    expect(duckTarget({ ...base, speakingIds: [], lastOtherSpeechAt: 9_300 })).toBe(1)
    expect(
      duckTarget({ ...base, enabled: false, speakingIds: ['ana'], lastOtherSpeechAt: 10_000 })
    ).toBe(1)
  })
  it('desce em 150 ms e sobe em 600 ms', () => {
    expect(stepGain(1, DUCK_GAIN, 150)).toBeCloseTo(DUCK_GAIN)
    expect(stepGain(1, DUCK_GAIN, 75)).toBeCloseTo(1 - (1 - DUCK_GAIN) / 2)
    expect(stepGain(DUCK_GAIN, 1, 300)).toBeCloseTo(DUCK_GAIN + (1 - DUCK_GAIN) / 2)
    expect(stepGain(DUCK_GAIN, 1, 10_000)).toBe(1)
  })
  it('parado (nada a rampear nem segurando): o laço de quadros pode parar', () => {
    const base = { meId: 'me', enabled: true, now: 10_000, speakingIds: [], lastOtherSpeechAt: 0 }
    // Ninguém fala e o ganho já está em 1: parado (é o caso de quase todo o tempo).
    expect(duckSettled(base, 1)).toBe(true)
    // Voltando ao normal depois de alguém falar: ainda rampa.
    expect(duckSettled(base, 0.5)).toBe(false)
    // Alguém fala e o ganho já chegou lá: parado até a fala mudar.
    expect(duckSettled({ ...base, speakingIds: ['ana'], lastOtherSpeechAt: 10_000 }, DUCK_GAIN)).toBe(true)
    // Parou de falar agora: segura 600 ms e depois sobe sozinho, então não para.
    expect(duckSettled({ ...base, lastOtherSpeechAt: 9_800 }, DUCK_GAIN)).toBe(false)
    // Ducking desligado: 1 e pronto.
    expect(duckSettled({ ...base, enabled: false, speakingIds: ['ana'] }, 1)).toBe(true)
  })
})

describe('sincronia do vídeo', () => {
  it('posição alvo desconta a latência do áudio', () => {
    expect(
      videoTargetSec({ startedAt: 1_000, nowMs: 11_000, serverOffsetMs: 0, audioLatencyMs: 250 })
    ).toBeCloseTo(9.75)
    expect(
      videoTargetSec({ startedAt: 1_000, nowMs: 11_000, serverOffsetMs: 500, audioLatencyMs: 250 })
    ).toBeCloseTo(10.25)
  })
  it('nada, ajuste de velocidade ou salto', () => {
    expect(videoSyncAction(10, 10.05)).toEqual({ kind: 'none' })
    expect(videoSyncAction(10, 10.5)).toEqual({ kind: 'rate', rate: 1.05 })
    expect(videoSyncAction(10.5, 10)).toEqual({ kind: 'rate', rate: 0.95 })
    expect(videoSyncAction(10, 12)).toEqual({ kind: 'seek', to: 12 })
  })
})

describe('wantsVideo', () => {
  it('só conta com vídeo disponível e painel ou palco ligado', () => {
    expect(wantsVideo(false, true, true)).toBe(false)
    expect(wantsVideo(true, false, false)).toBe(false)
    expect(wantsVideo(true, true, false)).toBe(true)
    expect(wantsVideo(true, false, true)).toBe(true)
  })
})

describe('canal do Maestro (#musica)', () => {
  it('o canal do Maestro é o de tipo "maestro" (o servidor manda system_kind); o nome não decide', () => {
    const channel = (name: string, system_kind?: string | null, is_system = true) => ({
      name,
      is_system,
      system_kind
    })
    expect(isMaestroChannel(channel('musica', 'maestro'))).toBe(true)
    // mesmo renomeado, o tipo é o que vale
    expect(isMaestroChannel(channel('som', 'maestro'))).toBe(true)
    // canal de sistema sem tipo, canal comum chamado musica e o de avisos não contam
    expect(isMaestroChannel(channel('musica', null))).toBe(false)
    expect(isMaestroChannel(channel('musica', undefined, false))).toBe(false)
    expect(isMaestroChannel(channel('avisos', 'notices'))).toBe(false)
  })

  it('mensagens do Maestro e do canal #musica nunca avisam; as outras avisam', () => {
    const channels = [
      { id: 'c-musica', name: 'musica', system_kind: 'maestro' },
      { id: 'c-geral', name: 'geral', system_kind: null }
    ]
    expect(isMaestroQuiet({ author_id: 'ana', channel_id: 'c-musica' }, channels)).toBe(true)
    expect(isMaestroQuiet({ author_id: MAESTRO_USER_ID, channel_id: 'c-geral' }, channels)).toBe(true)
    expect(isMaestroQuiet({ author_id: 'ana', channel_id: 'c-geral' }, channels)).toBe(false)
    expect(isMaestroQuiet({ author_id: 'ana', channel_id: null }, channels)).toBe(false)
  })

  it('a lista de comandos fixada aparece como mensagem do Maestro', () => {
    expect(isMaestroMessageKind('music')).toBe(true)
    expect(isMaestroMessageKind('music_commands')).toBe(true)
    expect(isMaestroMessageKind('welcome')).toBe(false)
    expect(isMaestroMessageKind(null)).toBe(false)
    expect(isMaestroMessageKind(undefined)).toBe(false)
  })
})
