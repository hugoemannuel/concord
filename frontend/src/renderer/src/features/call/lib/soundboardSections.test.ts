import { describe, expect, it } from 'vitest'
import { allServerSounds, findSoundForShortcut, soundboardLayout } from './soundboardSections'

type Snd = { id: string; server_id: string; name: string }
const snd = (id: string, server = 'srv-a', name = id): Snd => ({ id, server_id: server, name })

const servers = [
  { id: 'srv-b', name: 'Servidor B' },
  { id: 'srv-a', name: 'Servidor A' },
  { id: 'srv-c', name: 'Servidor C' }
]

describe('soundboardLayout', () => {
  const soundsByServer = {
    'srv-a': [snd('a1', 'srv-a', 'Buzina'), snd('a2', 'srv-a', 'Corneta')],
    'srv-b': [snd('b1', 'srv-b', 'Bateria'), snd('b2', 'srv-b', 'Apito')]
  }
  const favorites = [
    { ...snd('b1', 'srv-b', 'Bateria'), server_name: 'Servidor B' },
    { ...snd('a2', 'srv-a', 'Corneta'), server_name: 'Servidor A' }
  ]
  const layout = (search = '', currentId = 'srv-a', list = servers) =>
    soundboardLayout({ servers: list, soundsByServer, favorites, currentId, search })

  it('favoritos primeiro; depois uma seção por servidor, o da chamada antes dos outros', () => {
    const { favorites: favs, sections } = layout()
    expect(favs.map((s) => s.id)).toEqual(['b1', 'a2'])
    expect(sections.map((s) => [s.server.id, s.items.map((i) => i.id)])).toEqual([
      ['srv-a', ['a1']],
      ['srv-b', ['b2']]
    ])
  })

  it('o favorito não repete na seção do servidor dele', () => {
    const ids = layout().sections.flatMap((s) => s.items.map((i) => i.id))
    expect(ids).not.toContain('b1')
    expect(ids).not.toContain('a2')
  })

  it('a busca filtra favoritos e servidores pelo nome e some com a seção vazia', () => {
    const { favorites: favs, sections } = layout('  bAt ')
    expect(favs.map((s) => s.id)).toEqual(['b1'])
    expect(sections).toEqual([])
  })

  it('sem busca, o servidor da chamada aparece mesmo vazio (é dali que se adiciona)', () => {
    const { sections } = layout('', 'srv-c')
    expect(sections[0]).toMatchObject({ server: { id: 'srv-c' }, items: [] })
  })

  it('visitante: o servidor da chamada entra mesmo fora da lista de servidores', () => {
    const visit = { id: 'srv-v', name: 'Visitado' }
    const { sections } = soundboardLayout({
      servers,
      extraServers: [visit],
      soundsByServer: { 'srv-v': [snd('v1', 'srv-v')] },
      favorites: [],
      currentId: 'srv-v',
      search: ''
    })
    expect(sections[0]).toMatchObject({ server: visit, items: [{ id: 'v1' }] })
  })
})

describe('allServerSounds', () => {
  it('os sons do servidor da chamada primeiro, depois os dos outros', () => {
    const byServer = { 'srv-b': [snd('b1', 'srv-b')], 'srv-a': [snd('a1')] }
    expect(allServerSounds(byServer, 'srv-a').map((s) => s.id)).toEqual(['a1', 'b1'])
  })
})

describe('findSoundForShortcut', () => {
  it('acha o som do atalho entre os do servidor e os favoritos', () => {
    const keybinds = { b1: 'Alt+1', a1: 'F2' }
    const sounds = [snd('a1'), snd('b1', 'srv-b')]
    expect(findSoundForShortcut('alt+1', keybinds, sounds)?.id).toBe('b1')
    expect(findSoundForShortcut('F2', keybinds, sounds)?.id).toBe('a1')
    expect(findSoundForShortcut('F3', keybinds, sounds)).toBeUndefined()
  })
})
