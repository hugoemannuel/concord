import { useState } from 'react'
import { showToast } from '../../../shared/store/toastStore'
import { SmileyIcon } from '../../../shared/ui/icons'
import Input from '../../../shared/ui/Input'
import Modal from '../../../shared/ui/Modal'
import EmojiPickerGrid from '../../emojis/components/EmojiPickerGrid'
import type { ServerTrait } from '../api/serverProfile'
import { MAX_TRAIT_TEXT } from '../lib/profileDraft'

/** Escolhe o emoji de um traço (só os do pack: o cartão aparece também para quem está fora). */
function TraitEmojiModal({
  onPick,
  onClose
}: {
  onPick: (emoji: string) => void
  onClose: () => void
}): React.JSX.Element {
  const [search, setSearch] = useState('')
  return (
    <Modal open title="Escolher emoji" onClose={onClose}>
      <Input
        placeholder="Buscar emoji…"
        aria-label="Buscar emoji"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="mt-3 max-h-72 overflow-y-auto overscroll-contain pr-1">
        <EmojiPickerGrid
          search={search}
          mode="reaction"
          onPick={(emoji) => {
            if (emoji.startsWith('<')) {
              showToast.error('Use um emoji comum: os do servidor não aparecem para quem está fora.')
              return
            }
            onPick(emoji)
          }}
        />
      </div>
    </Modal>
  )
}

/** Até 5 traços: emoji e texto curto. */
export default function TraitsField({
  traits,
  onChange
}: {
  traits: ServerTrait[]
  onChange: (traits: ServerTrait[]) => void
}): React.JSX.Element {
  const [picking, setPicking] = useState<number | null>(null)
  const update = (index: number, patch: Partial<ServerTrait>): void =>
    onChange(traits.map((t, i) => (i === index ? { ...t, ...patch } : t)))
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {traits.map((trait, index) => (
        <div key={index} className="flex min-w-0 items-center gap-2 rounded-md border border-subtle bg-input px-2">
          <button
            type="button"
            aria-label={`Escolher o emoji do traço ${index + 1}`}
            onClick={() => setPicking(index)}
            className="focus-ring flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-md text-ds-lg text-muted hover:bg-fg/5"
          >
            {trait.emoji || <SmileyIcon />}
          </button>
          <input
            value={trait.text}
            maxLength={MAX_TRAIT_TEXT}
            aria-label={`Texto do traço ${index + 1}`}
            placeholder="Ex.: jogos à noite"
            onChange={(e) => update(index, { text: e.target.value })}
            className="focus-ring h-10 min-w-0 flex-1 rounded bg-transparent text-ds-sm text-strong placeholder:text-faint"
          />
        </div>
      ))}
      {picking !== null && (
        <TraitEmojiModal
          onClose={() => setPicking(null)}
          onPick={(emoji) => {
            update(picking, { emoji })
            setPicking(null)
          }}
        />
      )}
    </div>
  )
}
