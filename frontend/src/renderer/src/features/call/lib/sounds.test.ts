import { afterEach, describe, expect, it, vi } from 'vitest'
import { MILESTONE_KINDS, milestoneFor } from '../../levels/lib/levels'
import {
  BASE_VOLUME,
  LEVEL_SOUNDS,
  MILESTONE_SOUNDS,
  noteVolume,
  oncePerKey,
  peakVolume,
  playNotes,
  playSound,
  setSoundHandler,
  SOUNDS,
  stopSound,
  type Note,
  type SoundName
} from './sounds'

const first = (name: keyof typeof SOUNDS): number => SOUNDS[name][0].freq
const last = (name: keyof typeof SOUNDS): number => SOUNDS[name][SOUNDS[name].length - 1].freq

/** Maior soma de ganhos de notas tocando ao mesmo tempo. */
const peakGain = (name: SoundName): number =>
  Math.max(
    ...SOUNDS[name].map((n) =>
      SOUNDS[name]
        .filter((o) => o.at <= n.at && n.at < o.at + o.duration)
        .reduce((sum, o) => sum + noteVolume(o), 0)
    )
  )
const names = Object.keys(SOUNDS) as SoundName[]

describe('SOUNDS', () => {
  it('entrar sobe, sair desce (como no Discord)', () => {
    expect(last('join')).toBeGreaterThan(first('join'))
    expect(last('leave')).toBeLessThan(first('leave'))
    expect(last('userJoin')).toBeGreaterThan(first('userJoin'))
    expect(last('userLeave')).toBeLessThan(first('userLeave'))
  })

  it('transmissão: abrir sobe, encerrar desce, e entrar na live soa diferente dos dois', () => {
    expect(last('liveStart')).toBeGreaterThan(first('liveStart'))
    expect(last('liveEnd')).toBeLessThan(first('liveEnd'))
    expect(last('liveJoin')).toBeGreaterThan(first('liveJoin'))
    expect(SOUNDS.liveJoin).not.toEqual(SOUNDS.liveStart)
    expect(SOUNDS.liveJoin).not.toEqual(SOUNDS.liveEnd)
    // Nenhum dos três é igual a entrar/sair da call.
    for (const live of ['liveStart', 'liveEnd', 'liveJoin'] as const) {
      for (const call of ['join', 'leave', 'userJoin', 'userLeave'] as const) {
        expect(SOUNDS[live]).not.toEqual(SOUNDS[call])
      }
    }
  })

  it('mutar desce, desmutar sobe', () => {
    expect(last('mute')).toBeLessThan(first('mute'))
    expect(last('unmute')).toBeGreaterThan(first('unmute'))
    expect(last('deafen')).toBeLessThan(first('deafen'))
    expect(last('undeafen')).toBeGreaterThan(first('undeafen'))
  })

  it('mensagem e menção sobem e soam diferentes', () => {
    expect(last('message')).toBeGreaterThan(first('message'))
    expect(last('mention')).toBeGreaterThan(first('mention'))
    expect(SOUNDS.message).not.toEqual(SOUNDS.mention)
    expect(SOUNDS.message).toHaveLength(2)
  })

  it('atualização: três notas subindo, sem sobrepor, diferente dos outros sons', () => {
    const notes = SOUNDS.update
    expect(notes).toHaveLength(3)
    expect(notes[1].freq).toBeGreaterThan(notes[0].freq)
    expect(notes[2].freq).toBeGreaterThan(notes[1].freq)
    for (let i = 1; i < notes.length; i++) {
      expect(notes[i].at).toBeGreaterThanOrEqual(notes[i - 1].at + notes[i - 1].duration)
    }
    expect(peakGain('update')).toBe(BASE_VOLUME)
    for (const other of names.filter((n) => n !== 'update')) {
      expect(SOUNDS.update).not.toEqual(SOUNDS[other])
    }
  })

  it('os sons de interface são curtos (menos de meio segundo)', () => {
    for (const [name, notes] of Object.entries(SOUNDS)) {
      if (LEVEL_SOUNDS.includes(name as never) || name === 'ring') continue
      const end = Math.max(...notes.map((n) => n.at + n.duration))
      expect(end).toBeLessThan(0.5)
    }
  })

  it('o toque da chamada (o de antes, repetido a cada 2 s) cabe no intervalo e é baixo', () => {
    const end = Math.max(...SOUNDS.ring.map((n) => n.at + n.duration))
    expect(end).toBeLessThan(1.5)
    expect(peakGain('ring')).toBeLessThanOrEqual(0.16)
  })

  it('alguém entrando na call é bem mais alto que os outros sons, sem estourar', () => {
    for (const name of names.filter((n) => n !== 'userJoin')) {
      expect(peakGain('userJoin')).toBeGreaterThan(peakGain(name))
    }
    expect(peakGain('userJoin')).toBeGreaterThanOrEqual(BASE_VOLUME * 3)
    for (const name of names) expect(peakGain(name)).toBeLessThanOrEqual(0.5)
  })

  it('alguém entrando: três notas subindo em no máximo 0,35 s', () => {
    const notes = SOUNDS.userJoin
    expect(notes).toHaveLength(3)
    expect(notes[1].freq).toBeGreaterThan(notes[0].freq)
    expect(notes[2].freq).toBeGreaterThan(notes[1].freq)
    expect(Math.max(...notes.map((n) => n.at + n.duration))).toBeLessThanOrEqual(0.35)
  })

  it('os outros sons de interface continuam no volume de antes', () => {
    // Os de subir de nível são novos e de propósito mais baixos (ver abaixo).
    const levelSounds: readonly SoundName[] = LEVEL_SOUNDS
    const own: SoundName[] = ['userJoin', 'ring']
    for (const name of names.filter((n) => !own.includes(n) && !levelSounds.includes(n))) {
      for (const note of SOUNDS[name]) expect(noteVolume(note)).toBe(0.12)
    }
  })
})

describe('sons de subir de nível', () => {
  const end = (name: keyof typeof SOUNDS): number =>
    Math.max(...SOUNDS[name].map((n) => n.at + n.duration))

  it('sobem e ficam mais ricos conforme a faixa', () => {
    for (const name of ['levelChime', 'levelChimeRich', 'levelFanfare'] as const) {
      expect(last(name)).toBeGreaterThan(first(name))
    }
    expect(SOUNDS.levelChimeRich.length).toBeGreaterThan(SOUNDS.levelChime.length)
    expect(SOUNDS.levelFanfare.length).toBeGreaterThan(SOUNDS.levelChimeRich.length)
    expect(end('levelFanfare')).toBeGreaterThan(end('levelChimeRich'))
    expect(end('levelChimeRich')).toBeGreaterThan(end('levelChime'))
  })

  it('cabem na celebração (fanfarra até ~2 s)', () => {
    expect(end('levelChime')).toBeLessThan(0.8)
    expect(end('levelFanfare')).toBeLessThanOrEqual(2)
  })

  it('ficam abaixo das vozes: nem somando notas passam de 0,8 do volume base', () => {
    for (const name of LEVEL_SOUNDS) {
      expect(peakVolume(SOUNDS[name])).toBeLessThanOrEqual(0.8 * BASE_VOLUME)
      expect(peakVolume(SOUNDS[name])).toBeGreaterThan(0)
    }
  })

  it('peakVolume soma as notas que tocam juntas', () => {
    expect(peakVolume(SOUNDS.join)).toBe(BASE_VOLUME)
    expect(
      peakVolume([
        { freq: 1, at: 0, duration: 1, volume: 0.3 },
        { freq: 2, at: 0.5, duration: 1, volume: 0.4 },
        { freq: 3, at: 2, duration: 1, volume: 0.6 }
      ])
    ).toBeCloseTo(0.7)
  })
})

describe('jingles dos marcos', () => {
  const end = (name: SoundName): number => Math.max(...SOUNDS[name].map((n) => n.at + n.duration))

  it('um jingle por marco, todos diferentes entre si', () => {
    expect(MILESTONE_SOUNDS).toHaveLength(MILESTONE_KINDS.length)
    for (const kind of MILESTONE_KINDS) expect(MILESTONE_SOUNDS).toContain(`milestone-${kind}`)
    const shapes = MILESTONE_SOUNDS.map((name) => JSON.stringify(SOUNDS[name]))
    expect(new Set(shapes).size).toBe(MILESTONE_SOUNDS.length)
    for (const name of MILESTONE_SOUNDS) expect(LEVEL_SOUNDS).toContain(name)
  })

  it('curtos, mas mais ricos que o chime de um nível comum', () => {
    for (const name of MILESTONE_SOUNDS) {
      expect(SOUNDS[name].length).toBeGreaterThan(SOUNDS.levelChime.length)
      expect(end(name)).toBeGreaterThanOrEqual(1)
      expect(end(name)).toBeLessThanOrEqual(3)
    }
  })

  it('acabam antes da animação do marco', () => {
    for (let level = 10; level <= 100; level += 10) {
      const m = milestoneFor(level)!
      expect(end(`milestone-${m.kind}`) * 1000).toBeLessThan(m.durationMs)
    }
  })

  it('ficam abaixo das vozes: nem somando notas passam de 0,8 do volume base', () => {
    for (const name of MILESTONE_SOUNDS) {
      expect(peakVolume(SOUNDS[name]), name).toBeLessThanOrEqual(0.8 * BASE_VOLUME)
    }
  })

  it('glissando (slide) só em frequências audíveis e positivas', () => {
    for (const name of MILESTONE_SOUNDS) {
      for (const note of SOUNDS[name] as Note[]) {
        expect(note.freq).toBeGreaterThanOrEqual(30)
        if (note.slide !== undefined) expect(note.slide).toBeGreaterThanOrEqual(30)
      }
    }
  })
})

describe('oncePerKey', () => {
  it('roda uma vez por chave (StrictMode monta efeitos duas vezes em dev)', () => {
    const first = oncePerKey()
    expect(first(1)).toBe(true)
    expect(first(1)).toBe(false)
    expect(first(2)).toBe(true)
    expect(first(2)).toBe(false)
  })
})

// AudioContext de mentira: só registra o que playSound agenda.
class FakeParam {
  value = 1
  ramps: { to: number; at: number }[] = []
  setValueAtTime(v: number): void {
    this.value = v
  }
  linearRampToValueAtTime(to: number, at: number): void {
    this.ramps.push({ to, at })
  }
  exponentialRampToValueAtTime(to: number, at: number): void {
    this.ramps.push({ to, at })
  }
  cancelled = 0
  cancelScheduledValues(): void {
    this.cancelled++
  }
}
class FakeNode {
  to: unknown = null
  connect<T>(node: T): T {
    this.to = node
    return node
  }
}
class FakeGain extends FakeNode {
  gain = new FakeParam()
}
class FakeOsc extends FakeNode {
  type = 'sine'
  frequency = new FakeParam()
  stops: number[] = []
  started = 0
  start(): void {
    this.started++
  }
  stop(at: number): void {
    this.stops.push(at)
  }
}
class FakeContext {
  static last: FakeContext
  currentTime = 0
  destination = { name: 'destination' }
  oscs: FakeOsc[] = []
  gains: FakeGain[] = []
  constructor() {
    FakeContext.last = this
  }
  createOscillator(): FakeOsc {
    const o = new FakeOsc()
    this.oscs.push(o)
    return o
  }
  createGain(): FakeGain {
    const g = new FakeGain()
    this.gains.push(g)
    return g
  }
  resume(): Promise<void> {
    return Promise.resolve()
  }
}

describe('playSound: sons de nível nunca se sobrepõem', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('um som de nível novo corta o anterior (fade curto) e os de interface não', () => {
    vi.stubGlobal('AudioContext', FakeContext)
    playSound('milestone-coins')
    const ctx = FakeContext.last
    const coins = ctx.oscs.slice()
    expect(coins).toHaveLength(SOUNDS['milestone-coins'].length)

    ctx.currentTime = 0.3
    playSound('mute')
    // Som de interface não mexe no jingle.
    for (const osc of coins) expect(osc.stops).toHaveLength(1)

    ctx.currentTime = 0.5
    playSound('levelChime')
    for (const osc of coins) {
      expect(osc.stops.length).toBe(2)
      expect(osc.stops[1]).toBeLessThanOrEqual(0.5 + 0.06)
    }
    // O grupo do jingle antigo vai a zero logo.
    const noteGain = coins[0].to as FakeGain
    const levelGroup = noteGain.to as FakeGain
    const fade = levelGroup.gain.ramps.at(-1)!
    expect(fade.to).toBe(0)
    expect(fade.at).toBeLessThanOrEqual(0.5 + 0.05)
  })
})

describe('playSound: troca pelos sons escolhidos', () => {
  afterEach(() => {
    setSoundHandler(null)
    vi.unstubAllGlobals()
  })

  it('o handler que tocou (ou silenciou) o som substitui o padrão', () => {
    vi.stubGlobal('AudioContext', FakeContext)
    playSound('mute')
    const ctx = FakeContext.last
    const before = ctx.oscs.length
    const play = vi.fn(() => true)
    setSoundHandler({ play, stop: vi.fn() })
    playSound('mention')
    expect(play).toHaveBeenCalledWith('mention')
    expect(ctx.oscs.length).toBe(before)
  })

  it('o handler que recusa deixa tocar o som padrão', () => {
    vi.stubGlobal('AudioContext', FakeContext)
    playSound('mute')
    const ctx = FakeContext.last
    const before = ctx.oscs.length
    setSoundHandler({ play: () => false, stop: vi.fn() })
    playSound('mention')
    expect(ctx.oscs.length).toBe(before + SOUNDS.mention.length)
  })

  it('stopSound passa para o handler', () => {
    const stop = vi.fn()
    setSoundHandler({ play: () => true, stop })
    stopSound('ring')
    expect(stop).toHaveBeenCalledWith('ring')
    setSoundHandler(null)
    expect(() => stopSound('ring')).not.toThrow()
  })
})

describe('playNotes', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('gain multiplica o volume de cada nota', () => {
    vi.stubGlobal('AudioContext', FakeContext)
    playSound('mute')
    const ctx = FakeContext.last
    const from = ctx.gains.length
    playNotes([{ freq: 440, at: 0, duration: 0.1, volume: 0.1 }], { gain: 1.5 })
    const peak = ctx.gains[from].gain.ramps[0].to
    expect(peak).toBeCloseTo(0.15)
  })

  it('volume zero não toca nada', () => {
    vi.stubGlobal('AudioContext', FakeContext)
    playSound('mute')
    const ctx = FakeContext.last
    const before = ctx.oscs.length
    playNotes(SOUNDS.mute, { gain: 0 })
    expect(ctx.oscs.length).toBe(before)
  })

  it('sem Web Audio (teste, SSR): não quebra', () => {
    vi.stubGlobal('AudioContext', undefined)
    expect(() => playNotes(SOUNDS.mute)).not.toThrow()
  })
})
