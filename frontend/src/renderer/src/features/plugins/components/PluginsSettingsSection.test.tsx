import { beforeEach, describe, expect, it, vi } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

vi.spyOn(React, 'useSyncExternalStore').mockImplementation((_subscribe, getSnapshot) =>
  getSnapshot()
)

const access = vi.hoisted(() => ({ perms: 0, isOwner: false }))
const toast = vi.hoisted(() => ({ error: vi.fn() }))
vi.mock('../../servers/hooks/useServerAccess', () => ({ useServerAccess: () => access }))
vi.mock('../../../shared/store/toastStore', () => ({ showToast: { error: toast.error } }))

import { useServerStore } from '../../servers/store/serverStore'
import { Perm } from '../../servers/lib/permissions'
import { usePluginsStore } from '../store/pluginsStore'
import type { Plugin, PluginStatus, ServerPlugin } from '../api/plugins'
import { ApiError } from '../../../shared/api/client'
import { availablePlugins, installAction, runExclusive, toggleAction, uninstallAction } from '../lib/pluginSettingsActions'
import PluginsSettingsSection from './PluginsSettingsSection'

const plugin = (id: string, status: PluginStatus = 'approved'): Plugin => ({
  id,
  name: `Plugin ${id}`,
  description: `desc ${id}`,
  panel_url: 'https://x.test',
  icon: 'quebra-cabeca',
  author_username: 'mugis',
  status
})
const installed = (id: string, enabled = true): ServerPlugin => ({ ...plugin(id), enabled })

function setup(opts: { perms?: number; isOwner?: boolean; list?: ServerPlugin[]; catalog?: Plugin[] }): string {
  access.perms = opts.perms ?? 0
  access.isOwner = opts.isOwner ?? false
  useServerStore.setState({ currentServer: { id: 's1' } as never })
  usePluginsStore.setState({ byServer: { s1: opts.list ?? [] }, catalog: opts.catalog ?? [] })
  return renderToStaticMarkup(<PluginsSettingsSection />)
}

describe('PluginsSettingsSection', () => {
  beforeEach(() => {
    toast.error.mockReset()
  })

  it('admin: vê Instalados, Disponíveis, a dica e só o que falta instalar', () => {
    const html = setup({
      perms: Perm.MANAGE_SERVER,
      list: [installed('a')],
      catalog: [plugin('a'), plugin('b')]
    })
    expect(html).toContain('Instalados neste servidor')
    expect(html).toContain('Disponíveis')
    expect(html).toContain('Instalar só deixa o plugin disponível. Cada membro escolhe se quer usar.')
    expect(html).toContain('Desinstalar')
    expect(html.match(/>Instalar</g)).toHaveLength(1)
    expect(html).toContain('Plugin b')
  })

  it('membro: sem Instalar/Desinstalar, com a dica e o Switch', () => {
    const html = setup({ list: [installed('a')], catalog: [plugin('b')] })
    expect(html).not.toContain('Instalar<')
    expect(html).not.toContain('Desinstalar')
    expect(html).not.toContain('Disponíveis')
    expect(html).toContain('Plugins deste servidor')
    expect(html).toContain('Ligue os que quiser ver na barra dos canais. Só muda para você.')
    expect(html).toContain('role="switch"')
  })

  it('vazio: mostra o texto do vazio', () => {
    expect(setup({})).toContain('Nenhum plugin instalado neste servidor ainda.')
  })
})

describe('availablePlugins', () => {
  it('catálogo menos os instalados; catálogo não carregado vira vazio', () => {
    expect(availablePlugins([plugin('a'), plugin('b')], [installed('a')]).map((p) => p.id)).toEqual(['b'])
    expect(availablePlugins(null, [])).toEqual([])
  })

  it('só fichas aprovadas: pendente e recusada/retirada (o time vê no catálogo) ficam de fora', () => {
    const catalog = [plugin('a'), plugin('p', 'pending'), plugin('r', 'rejected')]
    expect(availablePlugins(catalog, []).map((p) => p.id)).toEqual(['a'])
  })
})

describe('ações', () => {
  beforeEach(() => {
    toast.error.mockReset()
  })

  it('Instalar chama install(serverId, id); Desinstalar e Switch idem', async () => {
    const install = vi.fn().mockResolvedValue(undefined)
    const uninstall = vi.fn().mockResolvedValue(undefined)
    const toggle = vi.fn().mockResolvedValue(undefined)
    usePluginsStore.setState({ install, uninstall, toggle })
    await installAction('s1', 'a')
    await uninstallAction('s1', 'a')
    await toggleAction('s1', 'a', false)
    expect(install).toHaveBeenCalledWith('s1', 'a')
    expect(uninstall).toHaveBeenCalledWith('s1', 'a')
    expect(toggle).toHaveBeenCalledWith('s1', 'a', false)
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('falha vira toast de erro, sem estourar e sem mostrar a mensagem crua', async () => {
    usePluginsStore.setState({ install: vi.fn().mockRejectedValue(new Error('boom')) })
    await expect(installAction('s1', 'a')).resolves.toBeUndefined()
    expect(toast.error).toHaveBeenCalledTimes(1)
    expect(toast.error).toHaveBeenCalledWith('Não foi possível concluir a ação.')
  })

  // Contrato com o backend: {"error": mensagem, "code": código} vira ApiError(status, error, code).
  it('erro de permissão do backend vira a mensagem de permissão do app', async () => {
    const err = new ApiError(403, 'permissão insuficiente', 'missing_permission')
    usePluginsStore.setState({ uninstall: vi.fn().mockRejectedValue(err) })
    await uninstallAction('s1', 'a')
    expect(toast.error).toHaveBeenCalledWith('Você não tem permissão para isso.')
  })

  it('código sem texto no app (not_approved) cai no texto genérico, nunca na mensagem do backend', async () => {
    const err = new ApiError(400, 'plugin não aprovado', 'not_approved')
    usePluginsStore.setState({ install: vi.fn().mockRejectedValue(err) })
    await installAction('s1', 'a')
    expect(toast.error).toHaveBeenCalledWith('Não foi possível concluir a ação.')
  })
})

describe('runExclusive', () => {
  it('segura o id durante o pedido, ignora repetição e solta ao fim', async () => {
    const held = new Set<string>()
    const seen: string[][] = []
    const notify = (b: Set<string>): void => void seen.push([...b])
    let finish!: () => void
    const fn = vi.fn(() => new Promise<void>((res) => (finish = res)))
    const first = runExclusive(held, 'a', notify, fn)
    expect(held.has('a')).toBe(true)
    await runExclusive(held, 'a', notify, fn)
    expect(fn).toHaveBeenCalledTimes(1)
    await runExclusive(held, 'b', notify, async () => undefined)
    finish()
    await first
    expect(held.size).toBe(0)
    expect(seen[0]).toEqual(['a'])
    expect(seen[seen.length - 1]).toEqual([])
  })

  it('solta o id também quando o pedido falha', async () => {
    const held = new Set<string>()
    await expect(
      runExclusive(held, 'a', () => undefined, () => Promise.reject(new Error('x')))
    ).rejects.toThrow('x')
    expect(held.size).toBe(0)
    const fn = vi.fn().mockResolvedValue(undefined)
    await runExclusive(held, 'a', () => undefined, fn)
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
