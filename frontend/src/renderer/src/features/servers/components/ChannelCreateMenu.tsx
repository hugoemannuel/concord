import { useEffect, useRef, useState } from 'react'
import Button from '../../../shared/ui/Button'
import IconButton from '../../../shared/ui/IconButton'
import { PlusIcon } from '../../../shared/ui/icons'

interface OptionsProps {
  channelLabel: string
  onChannel: () => void
  onCategory: () => void
}

export function ChannelCreationOptions({ channelLabel, onChannel, onCategory }: OptionsProps): React.JSX.Element {
  return <div className="flex flex-col gap-1">
    <Button variant="ghost" size="sm" className="justify-start" onClick={onChannel}>{channelLabel}</Button>
    <Button variant="ghost" size="sm" className="justify-start" onClick={onCategory}>Criar categoria</Button>
  </div>
}

/** O mesmo botão de adicionar oferece canal ou categoria, com teclado e toque. */
export default function ChannelCreateMenu(props: OptionsProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const host = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    host.current?.querySelector<HTMLButtonElement>('[data-creation-options] button')?.focus()
    const close = (event: PointerEvent): void => {
      if (!host.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])
  const pick = (action: () => void): void => { setOpen(false); action() }
  return <div ref={host} className="relative" onKeyDown={(event) => {
    if (event.key === 'Escape') { setOpen(false); trigger.current?.focus() }
  }}>
    <IconButton ref={trigger} icon={PlusIcon} label={props.channelLabel} size="md" aria-expanded={open} onClick={() => setOpen(!open)} />
    {open && <div data-creation-options className="absolute right-0 top-full z-30 mt-1 w-48 rounded-xl border border-subtle bg-floating p-1.5 shadow-2xl">
      <ChannelCreationOptions channelLabel={props.channelLabel} onChannel={() => pick(props.onChannel)} onCategory={() => pick(props.onCategory)} />
    </div>}
  </div>
}
