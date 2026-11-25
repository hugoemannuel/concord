import { describe, expect, it } from 'vitest'
import { PANEL_TABS } from './panelTabs'

describe('PANEL_TABS', () => {
  it('ids únicos e que cabem na URL; Lives é a primeira', () => {
    const ids = PANEL_TABS.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/)
    expect(ids[0]).toBe('lives')
    expect(ids).toEqual(['lives', 'chamadas', 'servidor', 'distribuicao', 'eventos'])
  })
})
