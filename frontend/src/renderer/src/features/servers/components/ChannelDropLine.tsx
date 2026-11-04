import type { DropLineSide } from '../lib/sidebarDrop'

/** Linha de soltar acima ou abaixo do canal ou da categoria. */
export function ChannelDropLine({ side }: { side: DropLineSide }): React.JSX.Element | null {
  if (!side) return null
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-x-1 z-20 h-0.5 rounded-full bg-brand shadow-[0_0_6px_var(--brand)] ${
        side === 'before' ? '-top-0.5' : '-bottom-0.5'
      }`}
    />
  )
}
