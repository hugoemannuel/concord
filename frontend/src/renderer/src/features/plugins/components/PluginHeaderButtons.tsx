import { useCallback, useEffect, useRef, useState } from 'react'
import { useServerStore } from '../../servers/store/serverStore'
import { usePluginsStore } from '../store/pluginsStore'
import { headerPlugins, shouldGroup } from '../lib/headerPlugins'
import { findOpenPlugin, pruneOpen, type OpenPlugin } from '../lib/openPlugin'
import { attachDismiss, focusOnEscape } from '../lib/dismiss'
import type { ServerPlugin } from '../api/plugins'
import IconButton from '../../../shared/ui/IconButton'
import { PuzzleIcon } from '../../../shared/ui/icons'
import { pluginIcon } from '../lib/pluginIcon'
import PluginPanel from './PluginPanel'

const NONE: ServerPlugin[] = []

export function PluginMenu({
  plugins,
  onPick
}: {
  plugins: ServerPlugin[]
  onPick: (p: ServerPlugin) => void
}): React.JSX.Element {
  return (
    <div
      role="menu"
      className="absolute right-4 top-14 z-50 flex max-h-[calc(100dvh-6rem)] w-56 flex-col overflow-y-auto rounded-xl border border-subtle bg-accent p-1 shadow-2xl"
    >
      {plugins.map((p) => (
        <button
          key={p.id}
          type="button"
          role="menuitem"
          onClick={() => onPick(p)}
          className="focus-ring min-h-10 truncate rounded-md px-3 text-left text-ds-sm text-normal hover:bg-fg/10"
        >
          {p.name}
        </button>
      ))}
    </div>
  )
}

/** Botões dos plugins ligados na barra do canal: um por plugin, ou um menu a partir de 3. */
export default function PluginHeaderButtons(): React.JSX.Element | null {
  const serverId = useServerStore((s) => s.currentServer?.id)
  const list = usePluginsStore((s) => (serverId ? s.byServer[serverId] : undefined)) ?? NONE
  const load = usePluginsStore((s) => s.load)
  const [open, setOpen] = useState<OpenPlugin | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
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

  const enabled = headerPlugins(list)
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

  if (enabled.length === 0) return null
  const grouped = shouldGroup(enabled.length)

  return (
    <div ref={wrap} className="flex items-center gap-2">
      {grouped ? (
        <IconButton
          icon={PuzzleIcon}
          label="Plugins"
          variant="filled"
          className="max-md:size-10"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={(e) => {
            anchor.current = e.currentTarget
            setMenuOpen((v) => !v)
          }}
        />
      ) : (
        enabled.map((p) => (
          <IconButton
            key={p.id}
            icon={pluginIcon(p.icon)}
            label={p.name}
            variant="filled"
            className="max-md:size-10"
            aria-expanded={current?.id === p.id}
            onClick={(e) => (current?.id === p.id ? close() : openPlugin(p, e.currentTarget))}
          />
        ))
      )}
      {grouped && menuOpen && (
        <PluginMenu plugins={enabled} onPick={(p) => openPlugin(p, anchor.current)} />
      )}
      {current && <PluginPanel plugin={current} onClose={close} anchorRef={anchor} />}
    </div>
  )
}
