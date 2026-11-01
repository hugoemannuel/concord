import { describe, expect, it } from 'vitest'
import {
  customThemeId,
  customThemeKey,
  MAX_CUSTOM_THEMES,
  newCustomTheme,
  normalizeCustomThemes,
  seedOf,
  upsertTheme,
  type CustomTheme
} from './customThemes'
import { PRESET_SEEDS } from './presetSeeds'
import { withDefaults } from './themeInput'

const VALID: CustomTheme = {
  id: 'abc123',
  name: 'Vermelho e branco',
  ...withDefaults({
    accent: '#e11d48',
    background: '#ffffff',
    sidebar: '#fff1f2',
    card: '#ffffff',
    text: '#1f1f1f',
    glow: ''
  })
}

describe('normalizeCustomThemes', () => {
  it('mantém os válidos e descarta lixo', () => {
    expect(normalizeCustomThemes([VALID])).toEqual([VALID])
    expect(normalizeCustomThemes(null)).toEqual([])
    expect(normalizeCustomThemes('x')).toEqual([])
    expect(normalizeCustomThemes([{ ...VALID, accent: 'red' }])).toEqual([])
    expect(normalizeCustomThemes([{ ...VALID, id: 'Com Espaço' }])).toEqual([])
    expect(normalizeCustomThemes([{ ...VALID, glow: 'azul' }])).toEqual([])
  })

  it('apara o nome, põe um padrão se vier vazio e corta no limite', () => {
    const [t] = normalizeCustomThemes([{ ...VALID, name: '   ' }])
    expect(t.name).toBe('Meu tema')
    const [long] = normalizeCustomThemes([{ ...VALID, name: '  ' + 'a'.repeat(50) }])
    expect(long.name).toHaveLength(32)
  })

  it('sem ids repetidos e no máximo o limite', () => {
    const many = Array.from({ length: MAX_CUSTOM_THEMES + 3 }, (_, i) => ({ ...VALID, id: `t${i}` }))
    expect(normalizeCustomThemes(many)).toHaveLength(MAX_CUSTOM_THEMES)
    expect(normalizeCustomThemes([VALID, { ...VALID, name: 'Outro' }])).toHaveLength(1)
  })

  it('cores em minúsculas', () => {
    const [t] = normalizeCustomThemes([{ ...VALID, accent: '#E11D48' }])
    expect(t.accent).toBe('#e11d48')
  })
})

describe('chave do tema no data-theme', () => {
  it('ida e volta', () => {
    expect(customThemeKey('abc123')).toBe('custom-abc123')
    expect(customThemeId('custom-abc123')).toBe('abc123')
    expect(customThemeId('discord-dark')).toBeNull()
  })
})

describe('upsertTheme', () => {
  it('troca o de mesmo id no lugar ou acrescenta no fim', () => {
    const other = { ...VALID, id: 'zzz' }
    expect(upsertTheme([VALID, other], { ...VALID, name: 'Novo' }).map((t) => t.name)).toEqual(['Novo', VALID.name])
    expect(upsertTheme([VALID], other)).toEqual([VALID, other])
  })
})

describe('newCustomTheme', () => {
  it('parte de um tema pronto, com id novo', () => {
    const t = newCustomTheme(PRESET_SEEDS.midnight, [{ ...VALID, name: 'Meu tema' }], () => 0.5)
    expect(t.id).toMatch(/^[a-z0-9]{1,24}$/)
    expect(t.id).not.toBe(VALID.id)
    expect(t.accent).toBe(PRESET_SEEDS.midnight.accent)
    expect(t.name).toBe('Meu tema 2')
  })
})

describe('seedOf', () => {
  it('tema próprio em uso: as cores dele; pronto: a semente; desconhecido: Discord Escuro', () => {
    expect(seedOf('custom-abc123', [VALID]).accent).toBe(VALID.accent)
    expect(seedOf('custom-abc123', [VALID])).not.toHaveProperty('name')
    expect(seedOf('forest', [VALID])).toEqual(PRESET_SEEDS.forest)
    expect(seedOf('custom-sumiu', [VALID])).toEqual(PRESET_SEEDS['discord-dark'])
  })
})
