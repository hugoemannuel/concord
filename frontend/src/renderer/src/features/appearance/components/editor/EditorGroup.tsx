import { useId, useState } from 'react'
import { ChevronDownIcon } from '../../../../shared/ui/icons'

/** Seção recolhível do editor de tema: o título é o botão que abre e fecha. */
export function EditorGroup({
  title,
  defaultOpen = false,
  children
}: {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}): React.JSX.Element {
  const [open, setOpen] = useState(defaultOpen)
  const id = useId()
  return (
    <section className="border-b border-subtle last:border-b-0">
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen(!open)}
          className="focus-ring-inset flex min-h-11 w-full cursor-pointer items-center justify-between gap-2 px-3 text-left text-ds-sm font-semibold text-strong hover:bg-hover"
        >
          {title}
          <ChevronDownIcon size={16} className={`shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </h3>
      <div id={id} hidden={!open} className="flex flex-col gap-3 px-3 pt-1 pb-3">
        {children}
      </div>
    </section>
  )
}
