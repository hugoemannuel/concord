import { useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useModalBehavior } from '../hooks/useModalBehavior'
import { trapTab } from '../lib/focusTrap'
import CloseButton from './CloseButton'

interface DrawerProps {
  open: boolean
  onClose: () => void
  /** Nome da gaveta para o leitor de tela e o título. */
  label: string
  /** Classes extras do fundo (ex.: `lg:hidden` para sumir onde há coluna fixa). */
  className?: string
  children: ReactNode
}

/**
 * Gaveta que entra pela direita, sobre o conteúdo (ex.: membros no celular).
 * Toque fora, o ✕ ou Esc fecham; o foco fica preso nela enquanto aberta.
 */
function Drawer({ open, onClose, label, className = '', children }: DrawerProps): React.JSX.Element | null {
  const panelRef = useRef<HTMLDivElement>(null)
  useModalBehavior(open, onClose, panelRef)
  if (!open) return null

  return createPortal(
    <div
      className={`app-no-drag fixed inset-x-0 bottom-0 z-40 flex justify-end bg-black/60 ${className}`}
      style={{ top: 'var(--titlebar-height, 0px)' }}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="animate-drawer-in flex h-full w-[min(20rem,88vw)] flex-col overflow-hidden border-l border-subtle bg-secondary pb-safe pr-safe pt-safe shadow-2xl shadow-black/60"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => trapTab(e, panelRef.current)}
      >
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-subtle pl-4 pr-1">
          <h2 className="truncate text-ds-md font-semibold text-strong">{label}</h2>
          <CloseButton label={`Fechar ${label.toLowerCase()}`} onClick={onClose} />
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
          {children}
        </div>
      </div>
    </div>,
    document.body
  )
}

export default Drawer
