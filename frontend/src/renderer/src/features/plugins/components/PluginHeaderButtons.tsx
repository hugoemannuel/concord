import { useCallback, useEffect, useRef, useState } from 'react'
import { useServerStore } from '../../servers/store/serverStore'
import { usePluginsStore } from '../store/pluginsStore'
import { headerPlugins } from '../lib/headerPlugins'
import { findOpenPlugin, pruneOpen, type OpenPlugin } from '../lib/openPlugin'
import { attachDismiss, focusOnEscape } from '../lib/dismiss'
import type { ServerPlugin } from '../api/plugins'
import IconButton from '../../../shared/ui/IconButton'
import { PuzzleIcon } from '../../../shared/ui/icons'
import { pluginIcon } from '../lib/pluginIcon'
import PluginPanel from './PluginPanel'
import PluginMenu from './PluginMenu'
import { usePluginBusy } from '../hooks/usePluginBusy'

const NONE: ServerPlugin[] = []

/**
 * Barra do canal: o quebra-cabeça (com plugin instalado) abre o menu de liga/desliga,
 * e os plugins ligados ganham o próprio ícone ao lado (até MAX_HEADER_ICONS).
 */
export default function PluginHeaderButtons(): React.JSX.Element | null {
  const serverId = useServerStore((s) => s.currentServer?.id)
  const list = usePluginsStore((s) => (serverId ? s.byServer[serverId] : undefined)) ?? NONE
  const load = usePluginsStore((s) => s.load)
  const [open, setOpen] = useState<OpenPlugin | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const busy = usePluginBusy()
  const anchor = useRef<HTMLElement | null>(null)
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (serverId) void load(serverId).catch(() => undefined)
  }, [serverId, load])

  useEffect(() => {
    if (!menuOpen) return undefined
    return attachDismiss(
      document,
      (n) => Boolean(wrap.current?.contains(n)),
      focusOnEscape(
        () => setMenuOpen(false),
        () => anchor.current?.focus()
      )
    )
  }, [menuOpen])

  // Último plugin desinstalado com o menu aberto: o menu não volta sozinho depois.
  const installed = list.length > 0
  useEffect(() => {
    if (!installed) setMenuOpen(false)
  }, [installed])

  const icons = headerPlugins(list)
  const current = findOpenPlugin(open, serverId, list)
  const kept = pruneOpen(open, serverId, list)

  useEffect(() => {
    if (kept !== open) setOpen(kept)
  }, [kept, open])

  const close = useCallback(() => {
    setOpen(null)
    anchor.current?.focus()
  }, [])

  function openPlugin(p: ServerPlugin, trigger: HTMLElement | null): void {
    if (!serverId) return
    anchor.current = trigger ?? anchor.current
    setMenuOpen(false)
    setOpen({ serverId, pluginId: p.id })
  }

  if (!serverId || list.length === 0) return null

  return (
    <div ref={wrap} className="flex items-center gap-2">
      <IconButton
        icon={PuzzleIcon}
        label="Plugins"
        variant="filled"
        className="max-md:size-10"
        aria-haspopup="dialog"
        aria-expanded={menuOpen}
        onClick={(e) => {
          anchor.current = e.currentTarget
          setMenuOpen((v) => !v)
        }}
      />
      {icons.map((p) => (
        <IconButton
          key={p.id}
          icon={pluginIcon(p.icon)}
          label={p.name}
          variant="filled"
          className="max-md:size-10"
          aria-expanded={current?.id === p.id}
          onClick={(e) => (current?.id === p.id ? close() : openPlugin(p, e.currentTarget))}
        />
      ))}
      {menuOpen && (
        <PluginMenu serverId={serverId} plugins={list} busy={busy} onOpen={(p) => openPlugin(p, anchor.current)} />
      )}
      {current && <PluginPanel plugin={current} onClose={close} anchorRef={anchor} />}
    </div>
  )
}
