import { dayLabelText, timeLabel, timeText } from './dayLabel'

describe('dayLabelText', () => {
  it('escreve o dia por extenso em português', () => {
    expect(dayLabelText('2026-10-28')).toBe('28 de outubro de 2026')
    expect(dayLabelText('2026-01-05')).toBe('5 de janeiro de 2026')
  })
})

describe('timeText', () => {
  it('hora e minuto com dois dígitos, no fuso pedido', () => {
    expect(timeText('2026-10-28T09:05:00Z', 'UTC')).toBe('09:05')
    expect(timeText('2026-10-28T23:51:00Z', 'UTC')).toBe('23:51')
  })
})

describe('timeLabel', () => {
  const SP = 'America/Sao_Paulo' // UTC-3
  // 3/11/2026 14:00 em São Paulo
  const now = new Date('2026-11-03T17:00:00Z')

  it('hoje: só a hora', () => {
    expect(timeLabel('2026-11-03T22:54:00Z', now, SP)).toBe('19:54')
  })

  it('ontem: "Ontem às" e a hora', () => {
    expect(timeLabel('2026-11-03T02:54:00Z', now, SP)).toBe('Ontem às 23:54')
  })

  it('mais antiga: data numérica e hora; ano diferente traz o ano', () => {
    expect(timeLabel('2026-11-02T02:54:00Z', now, SP)).toBe('01/11/2026 23:54')
    expect(timeLabel('2025-12-31T15:05:00Z', now, SP)).toBe('31/12/2025 12:05')
  })

  it('virada de mês e de ano: ontem é o último dia do mês anterior', () => {
    expect(timeLabel('2026-12-31T15:00:00Z', new Date('2027-01-01T15:00:00Z'), SP)).toBe('Ontem às 12:00')
    expect(timeLabel('2028-02-29T15:00:00Z', new Date('2028-03-01T15:00:00Z'), SP)).toBe('Ontem às 12:00')
  })

  it('o fuso decide o que é hoje e ontem', () => {
    const nowTokyo = new Date('2026-11-03T03:00:00Z')
    expect(timeLabel('2026-11-03T02:54:00Z', nowTokyo, 'Asia/Tokyo')).toBe('11:54')
    expect(timeLabel('2026-11-03T02:54:00Z', now, SP)).toBe('Ontem às 23:54')
  })

  it('data inválida vira texto vazio', () => {
    expect(timeLabel('lixo', now, SP)).toBe('')
  })
})
