import type { ServerPlugin } from '../api/plugins'

export default function PluginMenu({
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
