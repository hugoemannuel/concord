import { describe, expect, it } from 'vitest'
import {
  SETTINGS_SECTIONS,
  accountName,
  currentSettingsSection,
  filterSections,
  escClosesSettings,
  settingsContentWidth
} from './settingsNav'

const ids = (query: string): string[] => filterSections(query).map((s) => s.id)

describe('filterSections', () => {
  it('acha os sons do app em Notificações', () => {
    expect(ids('pacote de sons')).toEqual(['notifications'])
    expect(ids('audio proprio')).toEqual(['notifications'])
  })

  it('sem busca mostra tudo', () => {
    expect(filterSections('  ')).toHaveLength(SETTINGS_SECTIONS.length)
  })

  it('acha pelo nome da seção', () => {
    expect(ids('perfis')).toEqual(['profiles'])
    expect(ids('voz')).toEqual(['voice'])
  })

  it('acha pelo que tem dentro', () => {
    expect(ids('gif')).toEqual(['profiles'])
    expect(ids('rnnoise')).toEqual(['voice'])
    expect(ids('overlay')).toEqual(['app'])
    expect(ids('tema')).toEqual(['appearance'])
    expect(ids('efeito')).toEqual(['profiles'])
    expect(ids('borda')).toEqual(['profiles'])
    expect(ids('modo escuro')).toEqual(['appearance'])
    expect(ids('status')).toEqual(['profiles'])
    expect(ids('invisivel')).toEqual(['profiles'])
    expect(ids('invisível')).toEqual(['profiles'])
  })

  it('ignora acento e maiúscula', () => {
    expect(ids('NOTIFICACAO')).toEqual(['notifications'])
    expect(ids('aniversario')).toEqual(['profiles'])
    expect(ids('aparencia')).toEqual(['appearance'])
    expect(ids('INVISIVEL')).toEqual(['profiles'])
  })

  it('"Vídeo" fica logo depois de "Voz e áudio" e acha câmera e fundo', () => {
    const order = SETTINGS_SECTIONS.map((s) => s.id)
    expect(order.indexOf('video')).toBe(order.indexOf('voice') + 1)
    expect(SETTINGS_SECTIONS.find((s) => s.id === 'video')?.label).toBe('Vídeo')
    expect(ids('webcam')).toEqual(['video'])
    expect(ids('camera')).toEqual(['video'])
    expect(ids('desfoque')).toEqual(['video'])
    expect(ids('borrar')).toEqual(['video'])
    expect(ids('plano de fundo')).toEqual(['video'])
  })

  it('sem resultado volta vazio', () => {
    expect(ids('xyzzy')).toEqual([])
  })
})

describe('accountName', () => {
  it('prefere o nome de exibição, depois o @', () => {
    expect(accountName({ display_name: 'Ana Souza', username: 'ana' })).toBe('Ana Souza')
    expect(accountName({ display_name: '', username: 'ana' })).toBe('ana')
  })

  it('sem conta, é vazio', () => {
    expect(accountName(null)).toBe('')
    expect(accountName(undefined)).toBe('')
  })
})

describe('currentSettingsSection', () => {
  it('devolve a seção pedida, ou a primeira se ela não existe (ex.: some no navegador)', () => {
    expect(currentSettingsSection(SETTINGS_SECTIONS, 'voice').id).toBe('voice')
    const semApp = SETTINGS_SECTIONS.filter((s) => s.id !== 'app')
    expect(currentSettingsSection(semApp, 'app').id).toBe(semApp[0].id)
  })
})

describe('settingsContentWidth', () => {
  it('Perfis é mais largo; o resto, a coluna de sempre', () => {
    expect(settingsContentWidth('profiles')).toBe('max-w-[1080px]')
    expect(settingsContentWidth('account')).toBe('max-w-[740px]')
  })
})

describe('escClosesSettings', () => {
  it('Esc fecha as configurações', () => {
    expect(escClosesSettings({ key: 'Escape', defaultPrevented: false }, false)).toBe(true)
  })
  it('outra tecla ou Esc já tratado (recorte) não fecham', () => {
    expect(escClosesSettings({ key: 'Enter', defaultPrevented: false }, false)).toBe(false)
    expect(escClosesSettings({ key: 'Escape', defaultPrevented: true }, false)).toBe(false)
  })
  it('com um modal aberto por cima, o Esc é só dele', () => {
    expect(escClosesSettings({ key: 'Escape', defaultPrevented: false }, true)).toBe(false)
  })
})
