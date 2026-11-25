import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DAYS,
  daysFromParam,
  findTab,
  PANEL_ID,
  PERIODS,
  tabElementId,
  tabPath
} from './panelRoute'

describe('daysFromParam', () => {
  it('aceita só os períodos do seletor; o resto vira o padrão (7 dias)', () => {
    for (const d of PERIODS) expect(daysFromParam(String(d))).toBe(d)
    expect(DEFAULT_DAYS).toBe(7)
    for (const raw of [null, '', '0', '5', '30', 'abc', '7.5', '-1']) {
      expect(daysFromParam(raw)).toBe(DEFAULT_DAYS)
    }
  })
})

describe('tabPath', () => {
  it('monta o link da aba com o período', () => {
    expect(tabPath('lives', 3)).toBe('/observabilidade/lives?dias=3')
  })
})

describe('findTab', () => {
  const tabs = [{ id: 'a' }, { id: 'b' }]
  it('acha pelo id; sem id ou id desconhecido, nada', () => {
    expect(findTab(tabs, 'b')).toBe(tabs[1])
    expect(findTab(tabs, undefined)).toBeUndefined()
    expect(findTab(tabs, 'z')).toBeUndefined()
  })
})

describe('ids do DOM', () => {
  it('cada aba tem o seu id; o painel é um só', () => {
    expect(tabElementId('lives')).toBe('obs-tab-lives')
    expect(PANEL_ID).toBe('obs-panel')
  })
})
