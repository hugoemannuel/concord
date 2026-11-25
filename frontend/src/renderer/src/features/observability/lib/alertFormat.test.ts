import { describe, expect, it } from 'vitest'
import type { AlertRow } from '../api/alerts'
import { alertDuration, recurrence, severityLabel } from './alertFormat'

const row = (over: Partial<AlertRow>): AlertRow => ({
  id: 1,
  rule_id: 'host_cpu',
  title: 'CPU da máquina',
  channel: 'alert_infra',
  severity: 'aviso',
  started_at: '2026-11-25T17:02:00Z',
  ended_at: '2026-11-25T17:18:00Z',
  text: '',
  ...over
})

describe('severityLabel', () => {
  it('diz crítico e aviso', () => {
    expect(severityLabel('critico')).toBe('Crítico')
    expect(severityLabel('aviso')).toBe('Aviso')
  })
})

describe('alertDuration', () => {
  const now = new Date('2026-11-25T20:00:00Z')
  it('mostra quanto durou', () => {
    expect(alertDuration(row({}), now)).toBe('16 min')
  })
  it('aberto conta até agora', () => {
    expect(alertDuration(row({ ended_at: null, started_at: '2026-11-25T18:40:00Z' }), now)).toBe('há 1 h 20 min')
  })
  it('evento de uma vez não tem duração', () => {
    expect(alertDuration(row({ started_at: '2026-11-25T17:02:00Z', ended_at: '2026-11-25T17:02:00Z' }), now)).toBe('—')
  })
  it('segundos e dias', () => {
    expect(alertDuration(row({ ended_at: '2026-11-25T17:02:40Z' }), now)).toBe('40 s')
    expect(alertDuration(row({ ended_at: '2026-11-26T20:02:00Z' }), now)).toBe('1 d 3 h')
  })
})

describe('recurrence', () => {
  it('conta por regra, da mais frequente para a menos', () => {
    const rows = [
      row({ id: 1 }),
      row({ id: 2, rule_id: 'unit_failed', title: 'Serviço do systemd falhou' }),
      row({ id: 3 }),
      row({ id: 4, rule_id: 'sem_titulo', title: '' })
    ]
    expect(recurrence(rows)).toEqual([
      { title: 'CPU da máquina', count: 2 },
      { title: 'Serviço do systemd falhou', count: 1 },
      { title: 'sem_titulo', count: 1 }
    ])
  })
})
