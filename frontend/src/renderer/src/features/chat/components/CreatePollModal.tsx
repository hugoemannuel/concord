import { useState } from 'react'
import Modal from '../../../shared/ui/Modal'
import Button from '../../../shared/ui/Button'
import { PlusIcon } from '../../../shared/ui/icons'
import { PollAnswerField } from './PollAnswerField'
import { showToast } from '../../../shared/store/toastStore'
import type { CreatePollInput } from '../api/messages'
import {
  POLL_DURATIONS,
  POLL_MAX_ANSWERS,
  POLL_MIN_ANSWERS,
  POLL_QUESTION_MAX,
  pollDraftError,
  type PollDraft,
  type PollDraftAnswer
} from '../lib/polls'
import { submitPoll } from '../lib/pollSubmit'

interface CreatePollModalProps {
  open: boolean
  onClose: () => void
  onCreate: (input: CreatePollInput) => Promise<void>
}

const emptyAnswer = (): PollDraftAnswer => ({ text: '', emoji: '', image_url: '' })

const emptyDraft = (): PollDraft => ({
  question: '',
  answers: [emptyAnswer(), emptyAnswer()],
  duration_hours: 24,
  allow_multiselect: false
})

function CreatePollModal({ open, onClose, onCreate }: CreatePollModalProps): React.JSX.Element {
  const [draft, setDraft] = useState<PollDraft>(emptyDraft)
  const [picker, setPicker] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const error = pollDraftError(draft)

  const close = (): void => {
    setDraft(emptyDraft())
    setPicker(null)
    onClose()
  }

  const updateAnswer = (index: number, patch: Partial<PollDraftAnswer>): void => {
    setDraft((d) => ({
      ...d,
      answers: d.answers.map((a, i) => (i === index ? { ...a, ...patch } : a))
    }))
  }

  const removeAnswer = (index: number): void => {
    setPicker(null)
    setDraft((d) => ({ ...d, answers: d.answers.filter((_, i) => i !== index) }))
  }

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (error || saving) return
    setSaving(true)
    await submitPoll({ create: onCreate, done: close, error: showToast.error }, draft)
    setSaving(false)
  }

  return (
    <Modal open={open} title="Criar enquete" onClose={close}>
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4"
        onMouseDown={() => setPicker(null)}
      >
        <label className="flex flex-col gap-1.5">
          <span className="flex items-baseline justify-between text-ds-sm font-medium text-secondary">
            Pergunta
            <span className="text-ds-xxs text-faint">
              {draft.question.length}/{POLL_QUESTION_MAX}
            </span>
          </span>
          <input
            autoFocus
            value={draft.question}
            onChange={(e) => setDraft((d) => ({ ...d, question: e.target.value }))}
            maxLength={POLL_QUESTION_MAX}
            placeholder="O que você quer perguntar?"
            className="glass-input"
          />
        </label>

        <div className="flex flex-col gap-2">
          <span className="text-ds-sm font-medium text-secondary">Respostas</span>
          {draft.answers.map((answer, i) => (
            <PollAnswerField
              key={i}
              index={i}
              answer={answer}
              pickerOpen={picker === i}
              removable={draft.answers.length > POLL_MIN_ANSWERS}
              onTogglePicker={() => setPicker((p) => (p === i ? null : i))}
              onClosePicker={() => setPicker(null)}
              onChange={(patch) => updateAnswer(i, patch)}
              onRemove={() => removeAnswer(i)}
            />
          ))}
          {draft.answers.length < POLL_MAX_ANSWERS && (
            <button
              type="button"
              onClick={() => setDraft((d) => ({ ...d, answers: [...d.answers, emptyAnswer()] }))}
              className="flex cursor-pointer items-center gap-1.5 self-start rounded-md px-1 py-1 text-ds-xs font-semibold text-brand transition-colors hover:text-strong"
            >
              <PlusIcon className="h-4 w-4" />
              Adicionar outra resposta
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-ds-sm text-secondary">
            Duração
            <select
              value={draft.duration_hours}
              onChange={(e) => setDraft((d) => ({ ...d, duration_hours: Number(e.target.value) }))}
              className="glass-input !w-auto !py-1.5"
            >
              {POLL_DURATIONS.map((d) => (
                <option key={d.hours} value={d.hours} className="bg-floating">
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-ds-sm text-secondary">
            <input
              type="checkbox"
              checked={draft.allow_multiselect}
              onChange={(e) => setDraft((d) => ({ ...d, allow_multiselect: e.target.checked }))}
              className="h-4 w-4 accent-brand"
            />
            Permitir múltiplas respostas
          </label>
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={close}>
            Cancelar
          </Button>
          <Button type="submit" disabled={Boolean(error) || saving} title={error ?? undefined}>
            {saving ? 'Publicando…' : 'Publicar'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

export default CreatePollModal
