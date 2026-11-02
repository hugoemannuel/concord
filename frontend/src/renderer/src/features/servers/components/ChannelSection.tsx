import type { DropLineSide } from '../lib/channelDrop'
import { ChannelListSkeleton } from '../../../shared/ui/skeleton/layouts'
import ChannelCreateMenu from './ChannelCreateMenu'

/** Linha de soltar (reordenar canais) acima ou abaixo do bloco do canal. */
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

interface ChannelSectionProps {
  title: string
  /** "Criar canal de ..." (só aparece para quem gerencia canais). */
  addLabel: string
  onAdd?: () => void
  onAddCategory: () => void
  /** A lista já é deste servidor. */
  ready: boolean
  count: number
  emptyText: string
  skeleton: { count: number; offset?: number }
  onDragLeave: (e: React.DragEvent<HTMLElement>) => void
  children: React.ReactNode
}

/** Uma seção da barra de canais (texto ou voz): título, "+", skeleton ou vazio e a lista. */
function ChannelSection({
  title,
  addLabel,
  onAdd,
  onAddCategory,
  ready,
  count,
  emptyText,
  skeleton,
  onDragLeave,
  children
}: ChannelSectionProps): React.JSX.Element {
  return (
    <div>
      <div className="flex items-center justify-between px-2">
        <p className="text-ds-sm font-medium text-muted">{title}</p>
        {onAdd && (
          <ChannelCreateMenu channelLabel={addLabel} onChannel={onAdd} onCategory={onAddCategory} />
        )}
      </div>
      <div className="mt-1 flex flex-col gap-0.5" onDragLeave={onDragLeave}>
        {!ready && <ChannelListSkeleton count={skeleton.count} offset={skeleton.offset} />}
        {ready && count === 0 && (
          <p className="px-2 text-ds-sm text-faint italic">{emptyText}</p>
        )}
        {children}
      </div>
    </div>
  )
}

export default ChannelSection
