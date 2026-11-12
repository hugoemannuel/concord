import { useId, type ReactNode } from 'react'
import { ChevronDownIcon, ChevronUpIcon } from '../../../shared/ui/icons'

/**
 * Faixa de participantes embaixo da live em destaque (ou de quem está sem vídeo,
 * embaixo do mosaico), com o botão de ocultar
 * (mesmo padrão dos controles da chamada). Oculta, ela recolhe com transição
 * e fica inerte (sem foco nem leitor de tela), mas segue montada: o áudio das
 * transmissões que estão nela não pode cortar.
 */
function ParticipantStrip({
  hidden,
  onToggle,
  children
}: {
  hidden: boolean
  onToggle: () => void
  children: ReactNode
}): React.JSX.Element {
  const regionId = useId()
  const label = hidden ? 'Mostrar participantes' : 'Ocultar participantes'
  const Chevron = hidden ? ChevronUpIcon : ChevronDownIcon

  return (
    <div className="flex shrink-0 flex-col">
      <div className="flex justify-center">
        <button
          type="button"
          onClick={onToggle}
          aria-label={label}
          aria-expanded={!hidden}
          aria-controls={regionId}
          title={label}
          className="flex h-7 cursor-pointer items-center gap-1.5 rounded-full border border-subtle bg-secondary px-3 text-ds-xs font-semibold text-secondary shadow-lg transition-colors hover:bg-fg/10 hover:text-strong"
        >
          <Chevron className="h-3.5 w-3.5" />
          {label}
        </button>
      </div>
      <div
        className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none ${
          hidden ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'
        }`}
      >
        <div id={regionId} inert={hidden} className="min-h-0 overflow-hidden">
          <div className="px-1 pb-1 pt-3">{children}</div>
        </div>
      </div>
    </div>
  )
}

export default ParticipantStrip
