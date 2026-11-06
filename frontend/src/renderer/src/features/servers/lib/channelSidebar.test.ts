import { describe, expect, it } from 'vitest'
import type { Channel } from '../api/channels'
import type { CallStateResponse } from '../../call/api/calls'
import {
  canOpenChannelMenu,
  channelSlug,
  errorText,
  shouldDismissMenu,
  sidebarSections,
  textRowClass,
  voiceUserIdsKey
} from './channelSidebar'

const ch = (id: string, type: 'text' | 'voice', server_id = 's1'): Channel => ({
  id,
  server_id,
  name: id,
  type,
  created_by: 'dono',
  created_at: `2026-01-0${id.length}T00:00:00Z`,
  updated_at: ''
})

describe('sidebarSections', () => {
  const channels = [ch('geral', 'text'), ch('voz', 'voice'), ch('memes', 'text')]

  it('separa texto e voz quando a lista é deste servidor', () => {
    const s = sidebarSections({ id: 's1' }, channels, 's1')
    expect(s.ready).toBe(true)
    expect(s.text.map((c) => c.id)).toEqual(['geral', 'memes'])
    expect(s.voice.map((c) => c.id)).toEqual(['voz'])
    expect(s.primaryId).toBe('geral')
  })

  it('já tem canal deste servidor: pronto mesmo sem a busca ter voltado', () => {
    expect(sidebarSections({ id: 's1' }, channels, 'outro').ready).toBe(true)
  })

  it('lista do servidor anterior (ou sem servidor): nada ainda', () => {
    const s = sidebarSections({ id: 's2' }, channels, 's1')
    expect(s.ready).toBe(false)
    expect(s.text).toEqual([])
    expect(s.voice).toEqual([])
    expect(sidebarSections(null, channels, 's1').ready).toBe(false)
  })
})

describe('canOpenChannelMenu', () => {
  it('texto: todo mundo; voz: só quem gerencia canais ou as permissões dele', () => {
    expect(canOpenChannelMenu({ type: 'text' }, false, false)).toBe(true)
    expect(canOpenChannelMenu({ type: 'voice' }, false, false)).toBe(false)
    expect(canOpenChannelMenu({ type: 'voice' }, true, false)).toBe(true)
    expect(canOpenChannelMenu({ type: 'voice' }, false, true)).toBe(true)
  })
})

describe('shouldDismissMenu', () => {
  const el = (inMenuButton: boolean): Element =>
    ({ closest: () => (inMenuButton ? {} : null) }) as unknown as Element
  const menu = (contains: boolean): Element => ({ contains: () => contains }) as unknown as Element

  it('clique fora fecha', () => {
    expect(shouldDismissMenu(el(false), menu(false))).toBe(true)
  })
  it('clique no menu, no "•••" ou sem alvo não fecha', () => {
    expect(shouldDismissMenu(el(false), menu(true))).toBe(false)
    expect(shouldDismissMenu(el(true), menu(false))).toBe(false)
    expect(shouldDismissMenu(null, menu(false))).toBe(false)
    expect(shouldDismissMenu(el(false), null)).toBe(true)
  })
})

describe('channelSlug e errorText', () => {
  it('nome no formato do servidor', () => {
    expect(channelSlug('  Off Topic  Geral ')).toBe('off-topic-geral')
  })
  it('mensagem do erro ou a padrão', () => {
    expect(errorText(new Error('caiu'), 'padrão')).toBe('caiu')
    expect(errorText('x', 'padrão')).toBe('padrão')
  })
})

describe('chamadas do servidor', () => {
  const state = (channel_id: string | null, users: string[]): CallStateResponse =>
    ({
      call: channel_id ? { id: 'c-' + channel_id, channel_id } : null,
      participants: users.map((user_id) => ({ user_id }))
    }) as unknown as CallStateResponse

  it('chave estável de quem está em voz', () => {
    expect(voiceUserIdsKey({ v1: state('v1', ['b', 'a']), v2: state('v2', ['c']) })).toBe('a,b,c')
    expect(voiceUserIdsKey({})).toBe('')
  })
})

describe('textRowClass', () => {
  it('ativo, com menu e apagado', () => {
    const cls = textRowClass({ canOpenMenu: true, active: true, dim: true })
    expect(cls).toContain('pr-7')
    expect(cls).toContain('bg-fg/10 text-strong')
    expect(cls).toContain('opacity-50')
  })
  it('comum', () => {
    const cls = textRowClass({ canOpenMenu: false, active: false, dim: false })
    expect(cls).toContain('pr-2.5')
    expect(cls).toContain('text-muted')
    expect(cls).not.toContain('opacity-50')
  })
})
