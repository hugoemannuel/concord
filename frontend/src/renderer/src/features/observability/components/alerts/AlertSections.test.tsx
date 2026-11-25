import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { AlertReport, AlertRow } from '../../api/alerts'
import { AlertSections } from './AlertSections'

const cpu: AlertRow = {
  id: 2,
  rule_id: 'host_cpu',
  title: 'CPU da máquina',
  channel: 'alert_infra',
  severity: 'critico',
  started_at: '2026-11-25T17:02:00Z',
  ended_at: null,
  text: 'CPU da máquina em 97% (limite 95%)'
}
const unit: AlertRow = { ...cpu, id: 1, rule_id: 'unit_failed', title: 'Serviço do systemd falhou', severity: 'aviso', ended_at: cpu.started_at, text: 'Aviso: o serviço concord-backup.service falhou.' }

const render = (report: AlertReport): string => renderToStaticMarkup(<AlertSections report={report} />)

describe('AlertSections', () => {
  it('mostra o disparado agora, a recorrência e o histórico', () => {
    const html = render({ enabled: true, active: [cpu], history: [cpu, unit] })
    expect(html).toContain('Disparados agora')
    expect(html).toContain('CPU da máquina em 97% (limite 95%)')
    expect(html).toContain('Crítico')
    expect(html).toContain('Serviço do systemd falhou: <span')
    expect(html).not.toContain('desligados')
  })

  it('mostra o canal de cada alerta e o último resumo diário', () => {
    const html = render({ enabled: true, active: [cpu], history: [cpu], last_summary_at: '2026-11-25T11:00:00Z' })
    expect(html).toContain('#alertas')
    expect(html).toContain('<th scope="col" class="px-3 py-2 font-medium">Canal</th>')
    expect(html).toContain('Último resumo diário:')
  })

  it('ligado sem resumo ainda: diz isso', () => {
    const html = render({ enabled: true, active: [], history: [], last_summary_at: null })
    expect(html).toContain('Nenhum resumo diário enviado ainda (sai às 8h, horário de Brasília).')
  })

  it('vazio e desligado: diz isso', () => {
    const html = render({ enabled: false, active: [], history: [] })
    expect(html).toContain('Os alertas estão desligados neste servidor')
    expect(html).toContain('Nada disparado agora.')
    expect(html).toContain('Nenhum alerta no período.')
    expect(html).not.toContain('Recorrência')
    expect(html).not.toContain('resumo diário')
  })
})
