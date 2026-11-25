import { describe, expect, it } from 'vitest'
import {
  chartPath,
  durationLabel,
  eventLabel,
  kindLabel,
  nearestIndex,
  niceMax,
  numberLabel,
  pctLabel,
  platformLabel,
  qualityLine
} from './reportFormat'

describe('rótulos', () => {
  it('duração', () => {
    expect(durationLabel(45)).toBe('45 s')
    expect(durationLabel(600)).toBe('10 min')
    expect(durationLabel(3900)).toBe('1 h 05 min')
  })
  it('porcentagem de fração e número', () => {
    expect(pctLabel(0.123)).toBe('12%')
    expect(pctLabel(null)).toBe('—')
    expect(numberLabel(1.26)).toBe('1,3')
    expect(numberLabel(null)).toBe('—')
    expect(numberLabel(12.5, 0)).toBe('13')
  })
  it('tipo de sessão e evento', () => {
    expect(kindLabel('transmite')).toBe('Transmitindo')
    expect(kindLabel('assiste')).toBe('Assistindo')
    expect(kindLabel('call')).toBe('Call')
    expect(kindLabel('x')).toBe('x')
    expect(eventLabel('degrau_caiu')).toBe('Qualidade caiu')
    expect(eventLabel('novo')).toBe('novo')
    expect(eventLabel('conexao_falhou')).toBe('Voz não conectou')
    expect(eventLabel('retomou')).toBe('Voltou à call (o app reiniciou)')
    // Falha na etapa de acesso (chamada encerrada, sem permissão) não é queda.
    expect(eventLabel('conexao_falhou', 'entrando (acesso): Você não tem mais acesso')).toBe(
      'Sem acesso à chamada'
    )
    expect(eventLabel('conexao_falhou', 'reconectando: caiu e não voltou')).toBe('Voz não conectou')
  })
  it('eventos do app Android', () => {
    expect(eventLabel('segundo_plano')).toBe('Saiu do app')
    expect(eventLabel('primeiro_plano')).toBe('Voltou ao app')
    expect(eventLabel('rede_trocou')).toBe('Trocou de rede')
    expect(eventLabel('rota_do_audio')).toBe('Saída do áudio')
  })
  it('plataforma, com o aparelho e a rede quando houver', () => {
    expect(platformLabel({ target: 'desktop', device: '', network: '' })).toBe('Desktop')
    // No navegador a "rede" é a estimativa de velocidade (4g mesmo no Wi-Fi): não aparece.
    expect(platformLabel({ target: 'web', device: '', network: '4g' })).toBe('Navegador')
    expect(
      platformLabel({ target: 'android', device: 'samsung SM-A515F', network: 'cellular-4g' })
    ).toBe('App Android · samsung SM-A515F · cellular-4g')
    expect(platformLabel({ target: '', device: '', network: '' })).toBe('plataforma desconhecida')
  })
})

describe('qualityLine', () => {
  const none = {
    capture_fps: null,
    recv_fps: null,
    codec_ms: null,
    fps: null,
    concealed_pct: null,
    recv_loss_pct: null,
    connect_ms: null,
    reconnects: 0,
    failures: 0
  }
  it('onde os quadros se perdem: captura × codificado, chegam × decodificados', () => {
    expect(
      qualityLine({ ...none, kind: 'transmite', capture_fps: 43, fps: 42, codec_ms: 4.6 })
    ).toBe('Captura 43 fps · codificado 42 fps · 4,6 ms/quadro')
    expect(qualityLine({ ...none, kind: 'assiste', recv_fps: 44, fps: 12 })).toBe(
      'Chegam 44 fps · decodificados 12 fps'
    )
  })
  it('voz: sintetizado, perda recebida, entrada, quedas e falhas', () => {
    expect(
      qualityLine({
        ...none,
        kind: 'call',
        concealed_pct: 4.52,
        recv_loss_pct: 0.1,
        connect_ms: 1850,
        reconnects: 2,
        failures: 1
      })
    ).toBe(
      'Áudio sintetizado 4,5% · perda recebida 0,1% · entrou em 1,9 s · 2 reconexões · 1 falha'
    )
  })
  it('voz: minutos de voz ruim e falhas de acesso (não são queda)', () => {
    expect(
      qualityLine({
        ...none,
        kind: 'call',
        concealed_pct: 1.2,
        bad_minutes: 48.4,
        access_failures: 1
      })
    ).toBe('Áudio sintetizado 1,2% · 48 min de voz ruim · 1 sem acesso à chamada')
    expect(qualityLine({ ...none, kind: 'call', bad_minutes: 0, access_failures: 0 })).toBeNull()
  })
  it('sem dado: null', () => {
    expect(qualityLine({ ...none, kind: 'call' })).toBeNull()
    expect(qualityLine({ ...none, kind: 'transmite' })).toBeNull()
  })
})

describe('gráfico', () => {
  it('teto redondo acima do maior valor', () => {
    expect(niceMax([0, 3.2, 7.9])).toBe(10)
    expect(niceMax([0, 0])).toBe(1)
    expect(niceMax([null, 42])).toBe(50)
    expect(niceMax([130])).toBe(150)
  })
  it('linha com lacunas onde não há valor', () => {
    expect(chartPath([0, 5, 10], 100, 50, 10)).toBe('M0,50L50,25L100,0')
    expect(chartPath([1, null, 1], 100, 50, 2)).toBe('M0,25M100,25')
    expect(chartPath([5], 100, 50, 10)).toBe('M0,25')
    expect(chartPath([], 100, 50, 10)).toBe('')
  })
  it('ponto mais perto do ponteiro', () => {
    expect(nearestIndex(0, 100, 5)).toBe(0)
    expect(nearestIndex(60, 100, 5)).toBe(2)
    expect(nearestIndex(100, 100, 5)).toBe(4)
    expect(nearestIndex(-5, 100, 5)).toBe(0)
    expect(nearestIndex(10, 100, 0)).toBe(-1)
  })
})
