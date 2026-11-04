import { describe, expect, it } from 'vitest'
import {
  clockTime,
  dayDividerText,
  dayKey,
  messageDateTitle,
  messageTimeLabel,
  msUntilNextDay,
  startsNewDay
} from './messageDates'

const SP = 'America/Sao_Paulo' // UTC-3 o ano todo desde 2019
const TOKYO = 'Asia/Tokyo' // UTC+9

/** Instante em UTC, para os testes não dependerem do fuso da máquina. */
const utc = (y: number, m: number, d: number, h = 0, min = 0): string =>
  new Date(Date.UTC(y, m - 1, d, h, min)).toISOString()

describe('dayKey', () => {
  it('é o dia civil no fuso pedido, não o dia em UTC', () => {
    // 01:30 UTC de 3/11 ainda é 22:30 de 2/11 em São Paulo
    expect(dayKey(utc(2026, 11, 3, 1, 30), SP)).toBe('2026-11-02')
    expect(dayKey(utc(2026, 11, 3, 1, 30), TOKYO)).toBe('2026-11-03')
    expect(dayKey(utc(2026, 11, 3, 1, 30), 'UTC')).toBe('2026-11-03')
  })

  it('data inválida vira texto vazio, sem lançar', () => {
    expect(dayKey('lixo', SP)).toBe('')
  })

  it('sem fuso usa o do aparelho', () => {
    const local = new Date(2026, 10, 3, 23, 59).toISOString()
    expect(dayKey(local)).toBe('2026-11-03')
  })
})

describe('startsNewDay', () => {
  it('a primeira mensagem da lista abre o dia', () => {
    expect(startsNewDay(utc(2026, 11, 3, 15), undefined, SP)).toBe(true)
  })

  it('mesmo dia não abre; virada de dia abre, mesmo com 4 minutos de diferença', () => {
    expect(startsNewDay(utc(2026, 11, 3, 15), utc(2026, 11, 3, 12), SP)).toBe(false)
    // 02:58 UTC = 23:58 em SP (dia 2); 03:02 UTC = 00:02 em SP (dia 3)
    expect(startsNewDay(utc(2026, 11, 3, 3, 2), utc(2026, 11, 3, 2, 58), SP)).toBe(true)
  })

  it('o mesmo par pode ser o mesmo dia em um fuso e dias diferentes em outro', () => {
    const a = utc(2026, 11, 3, 2, 58)
    const b = utc(2026, 11, 3, 3, 2)
    expect(startsNewDay(b, a, 'UTC')).toBe(false)
    expect(startsNewDay(b, a, SP)).toBe(true)
  })

  it('o mesmo dia em anos diferentes é dia diferente', () => {
    expect(startsNewDay(utc(2026, 11, 3, 12), utc(2025, 11, 3, 12), SP)).toBe(true)
  })

  it('data inválida não desenha separador', () => {
    expect(startsNewDay('lixo', undefined, SP)).toBe(false)
    expect(startsNewDay('lixo', utc(2026, 11, 3, 12), SP)).toBe(false)
  })

  it('anterior inválida: mostra o separador da atual', () => {
    expect(startsNewDay(utc(2026, 11, 3, 12), 'lixo', SP)).toBe(true)
  })
})

describe('dayDividerText', () => {
  it('data por extenso, no fuso pedido', () => {
    expect(dayDividerText(utc(2026, 11, 3, 15), SP)).toBe('3 de novembro de 2026')
    expect(dayDividerText(utc(2026, 11, 3, 1, 30), SP)).toBe('2 de novembro de 2026')
    expect(dayDividerText(utc(2025, 1, 15, 15), SP)).toBe('15 de janeiro de 2025')
  })

  it('data inválida vira texto vazio', () => {
    expect(dayDividerText('lixo', SP)).toBe('')
  })
})

describe('clockTime', () => {
  it('hora e minuto, com zero à esquerda, no fuso pedido', () => {
    expect(clockTime(utc(2026, 11, 3, 22, 54), SP)).toBe('19:54')
    expect(clockTime(utc(2026, 11, 3, 3, 20), SP)).toBe('00:20')
  })
})

describe('messageTimeLabel', () => {
  // "agora" = 3/11/2026 14:00 em SP
  const now = new Date(utc(2026, 11, 3, 17, 0))

  it('mensagem de hoje: só a hora', () => {
    expect(messageTimeLabel(utc(2026, 11, 3, 22, 54), now, SP)).toBe('19:54')
  })

  it('mensagem de ontem: "Ontem às" e a hora', () => {
    expect(messageTimeLabel(utc(2026, 11, 3, 2, 54), now, SP)).toBe('Ontem às 23:54')
  })

  it('mais antiga: data numérica e hora', () => {
    expect(messageTimeLabel(utc(2026, 11, 2, 2, 54), now, SP)).toBe('01/11/2026 23:54')
  })

  it('ano diferente: a data traz o ano', () => {
    expect(messageTimeLabel(utc(2025, 12, 31, 15, 5), now, SP)).toBe('31/12/2025 12:05')
  })

  it('hoje/ontem seguem o fuso: a mesma mensagem muda de rótulo', () => {
    // 3/11 02:54 UTC: em SP é ontem (23:54); em Tóquio é hoje (11:54)
    const nowTokyo = new Date(utc(2026, 11, 3, 3, 0))
    expect(messageTimeLabel(utc(2026, 11, 3, 2, 54), nowTokyo, TOKYO)).toBe('11:54')
    expect(messageTimeLabel(utc(2026, 11, 3, 2, 54), now, SP)).toBe('Ontem às 23:54')
  })

  it('virada de mês e de ano: ontem é o último dia do mês anterior', () => {
    const jan1 = new Date(utc(2027, 1, 1, 15, 0))
    expect(messageTimeLabel(utc(2026, 12, 31, 15, 0), jan1, SP)).toBe('Ontem às 12:00')
    const mar1 = new Date(utc(2028, 3, 1, 15, 0))
    expect(messageTimeLabel(utc(2028, 2, 29, 15, 0), mar1, SP)).toBe('Ontem às 12:00')
  })

  it('mensagem do futuro (relógio adiantado) mostra a data completa', () => {
    expect(messageTimeLabel(utc(2026, 11, 4, 15, 0), now, SP)).toBe('04/11/2026 12:00')
  })

  it('data inválida vira texto vazio', () => {
    expect(messageTimeLabel('lixo', now, SP)).toBe('')
  })
})

describe('messageDateTitle', () => {
  it('dia da semana, data por extenso e hora', () => {
    const title = messageDateTitle(utc(2026, 11, 2, 22, 54), SP)
    expect(title).toContain('segunda-feira')
    expect(title).toContain('2 de novembro de 2026')
    expect(title).toContain('19:54')
  })

  it('data inválida vira texto vazio', () => {
    expect(messageDateTitle('lixo', SP)).toBe('')
  })
})

describe('msUntilNextDay', () => {
  it('conta até a próxima meia-noite do fuso, com 1 s de folga', () => {
    // 23:59:30 em SP
    const now = new Date(Date.UTC(2026, 10, 4, 2, 59, 30))
    expect(msUntilNextDay(now, SP)).toBe(30_000 + 1_000)
  })

  it('logo depois da meia-noite espera quase um dia inteiro', () => {
    const now = new Date(utc(2026, 11, 3, 3, 0)) // 00:00 em SP
    expect(msUntilNextDay(now, SP)).toBe(24 * 3_600_000 + 1_000)
  })

  it('o fuso muda o resultado', () => {
    const now = new Date(utc(2026, 11, 3, 14, 0)) // 23:00 em Tóquio, 11:00 em SP
    expect(msUntilNextDay(now, TOKYO)).toBe(3_600_000 + 1_000)
    expect(msUntilNextDay(now, SP)).toBe(13 * 3_600_000 + 1_000)
  })
})
