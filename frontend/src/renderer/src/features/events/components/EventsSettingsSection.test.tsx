import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { RoleSetting } from '../api/events'

const hook = vi.hoisted(() => ({
  state: { roles: undefined as RoleSetting[] | undefined, error: null as string | null, saving: false }
}))
vi.mock('../hooks/useRoleSettings', () => ({
  useRoleSettings: () => ({ ...hook.state, toggle: () => {}, reload: () => {} })
}))
const access = vi.hoisted(() => ({ owner: true }))
vi.mock('../hooks/useEventAccess', () => ({
  useEventAccess: () => ({ create: true, edit: true, delete: true, configure: true, owner: access.owner })
}))
vi.mock('../../servers/store/serverStore', () => ({
  useServerStore: (selector: (s: unknown) => unknown) => selector({ currentServer: { id: 's1' } })
}))

import EventsSettingsSection from './EventsSettingsSection'

const roles: RoleSetting[] = [
  { role_id: 'a', name: 'Cargo A', create: true, edit: false, delete: false, configure: false },
  { role_id: 'b', name: 'Cargo B', create: false, edit: true, delete: true, configure: true }
]

function render(): string {
  return renderToStaticMarkup(<EventsSettingsSection />)
}

/** O interruptor com esse nome: aria-checked dele. */
function checked(html: string, label: string): string {
  const match = new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`).exec(html)
  if (!match) throw new Error(`sem interruptor "${label}"`)
  return /aria-checked="(true|false)"/.exec(match[0])![1]
}

describe('EventsSettingsSection', () => {
  beforeEach(() => {
    hook.state = { roles, error: null, saving: false }
    access.owner = true
  })

  /** O interruptor com esse nome está travado? */
  function disabled(html: string, label: string): boolean {
    const match = new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`).exec(html)
    if (!match) throw new Error(`sem interruptor "${label}"`)
    return match[0].includes('disabled=""')
  }

  it('explica que vale para todos os eventos e que o dono sempre pode tudo', () => {
    const html = render()
    expect(html).toContain('Vale para todos os eventos do servidor')
    expect(html).toContain('o dono do servidor sempre pode tudo')
  })

  it('mostra quatro interruptores por cargo com o que o dono já marcou', () => {
    const html = render()
    expect(html.match(/role="switch"/g)).toHaveLength(8)
    expect(checked(html, 'Cargo B: Configurar eventos')).toBe('true')
    expect(checked(html, 'Cargo A: Configurar eventos')).toBe('false')
    expect(checked(html, 'Cargo A: Criar eventos')).toBe('true')
    expect(checked(html, 'Cargo A: Editar eventos')).toBe('false')
    expect(checked(html, 'Cargo B: Editar eventos')).toBe('true')
    expect(checked(html, 'Cargo B: Excluir eventos')).toBe('true')
    expect(html).toContain('Cargo A')
    expect(html).toContain('Cargo B')
  })

  it('carregando, avisa', () => {
    hook.state = { roles: undefined, error: null, saving: false }
    expect(render()).toContain('Carregando cargos…')
  })

  it('com erro, mostra a mensagem e o botão para tentar de novo', () => {
    hook.state = { roles: undefined, error: 'Não foi possível carregar os cargos.', saving: false }
    const html = render()
    expect(html).toContain('Não foi possível carregar os cargos.')
    expect(html).toContain('Tentar de novo')
  })

  it('sem cargos, manda criar cargos primeiro', () => {
    hook.state = { roles: [], error: null, saving: false }
    expect(render()).toContain('Este servidor ainda não tem cargos')
  })

  it('erro ao salvar aparece sem esconder a lista', () => {
    hook.state = { roles, error: 'Não foi possível salvar. Tente de novo.', saving: false }
    const html = render()
    expect(html).toContain('Não foi possível salvar. Tente de novo.')
    expect(html.match(/role="switch"/g)).toHaveLength(8)
  })

  it('o dono liga e desliga tudo', () => {
    const html = render()
    expect(disabled(html, 'Cargo A: Criar eventos')).toBe(false)
    expect(disabled(html, 'Cargo A: Configurar eventos')).toBe(false)
  })

  it('quem só recebeu a configuração mexe em criar, editar e excluir, mas não em configurar', () => {
    access.owner = false
    const html = render()
    expect(disabled(html, 'Cargo A: Criar eventos')).toBe(false)
    expect(disabled(html, 'Cargo A: Excluir eventos')).toBe(false)
    expect(disabled(html, 'Cargo A: Configurar eventos')).toBe(true)
    expect(disabled(html, 'Cargo B: Configurar eventos')).toBe(true)
    expect(html).toContain('Só o dono do servidor liga ou desliga Configurar eventos')
  })
})
