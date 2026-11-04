import { describe, expect, it } from 'vitest'
import { gameTileAccent, knownGames, searchGames, toggleGame } from './gameSearch'
import { MAX_GAMES } from './profileDraft'

describe('knownGames', () => {
  it('junta o catálogo com o que os membros jogam, sem repetir', () => {
    const games = knownGames([{ name: 'Hades', app_id: 1145360 }, { name: 'Dota 2', app_id: 570 }])
    const names = games.map((g) => g.name)
    expect(names).toContain('VALORANT')
    expect(names).toContain('Hades')
    expect(names.filter((n) => n === 'Dota 2')).toHaveLength(1)
    // O dos membros vem com o ícone da Steam.
    expect(games.find((g) => g.name === 'Dota 2')?.app_id).toBe(570)
  })
})

describe('searchGames', () => {
  const list = [{ name: 'League of Legends' }, { name: 'Hades' }, { name: 'Pokémon' }]
  it('acha sem diferenciar caixa nem acento', () => {
    expect(searchGames('league', list).map((g) => g.name)).toEqual(['League of Legends'])
    expect(searchGames('POKEMON', list).map((g) => g.name)).toEqual(['Pokémon'])
  })
  it('busca vazia mostra tudo e respeita o limite', () => {
    expect(searchGames('', list)).toHaveLength(3)
    expect(searchGames('', list, 2)).toHaveLength(2)
  })
})

describe('toggleGame', () => {
  it('põe e tira', () => {
    const one = toggleGame([], { name: 'Hades' })
    expect(one).toEqual([{ name: 'Hades' }])
    expect(toggleGame(one, { name: 'Hades' })).toEqual([])
  })
  it('no limite, não põe mais', () => {
    const full = Array.from({ length: MAX_GAMES }, (_, i) => ({ name: `g${i}` }))
    expect(toggleGame(full, { name: 'novo' })).toBe(full)
    expect(toggleGame(full, { name: 'g0' })).toHaveLength(MAX_GAMES - 1)
  })
})

describe('gameTileAccent', () => {
  it('a cor do catálogo; fora dele, nenhuma', () => {
    expect(gameTileAccent('VALORANT')).toBe('#fd4556')
    expect(gameTileAccent('Hades')).toBeUndefined()
  })
})
