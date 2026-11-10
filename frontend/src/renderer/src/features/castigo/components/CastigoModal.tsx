import Button from '../../../shared/ui/Button'
import Modal from '../../../shared/ui/Modal'
import Switch from '../../../shared/ui/Switch'
import { useCastigoForm } from '../hooks/useCastigoForm'
import { DURATIONS, EFFECT_KEYS, hasAnyEffect } from '../lib/castigo'
import { CASTIGO_COPY, durationLabel } from '../lib/castigoCopy'
import { useCastigoDialogStore, type CastigoTarget } from '../store/castigoDialogStore'

/** "Castigo para Fulano": o que tirar, por quanto tempo, e castigar ou abrir votação. */
function CastigoModal(): React.JSX.Element | null {
  const target = useCastigoDialogStore((s) => s.target)
  const close = useCastigoDialogStore((s) => s.close)
  if (!target) return null
  return (
    <Modal open title={CASTIGO_COPY.modalTitle(target.name)} onClose={close}>
      <CastigoForm key={target.userId} target={target} onDone={close} />
    </Modal>
  )
}

export function CastigoForm({
  target,
  onDone
}: {
  target: CastigoTarget
  onDone: () => void
}): React.JSX.Element {
  const form = useCastigoForm(target, onDone)
  const picked = hasAnyEffect(form.effects)
  const directHint = !form.showDirect
    ? CASTIGO_COPY.noPowerHint
    : picked && !form.canDirect
      ? CASTIGO_COPY.missingPowerHint
      : null

  return (
    <div className="flex flex-col gap-5">
      <p className="text-ds-sm text-secondary">{CASTIGO_COPY.modalIntro}</p>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-ds-sm font-medium text-secondary">
          {CASTIGO_COPY.effectsLabel}
        </legend>
        {EFFECT_KEYS.map((key) => (
          <div key={key} className="flex min-h-10 items-center justify-between gap-3">
            <span className="text-ds-sm text-strong">{CASTIGO_COPY.effect[key]}</span>
            <Switch
              checked={form.effects[key]}
              onChange={() => form.toggle(key)}
              label={CASTIGO_COPY.effect[key]}
            />
          </div>
        ))}
        {!picked && <p className="text-ds-xs text-warning">{CASTIGO_COPY.pickEffect}</p>}
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-ds-sm font-medium text-secondary">
          {CASTIGO_COPY.durationLabel}
        </legend>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {DURATIONS.map((d) => (
            <label
              key={d}
              className={`flex min-h-10 cursor-pointer items-center justify-center rounded-lg border px-2 text-ds-sm font-medium transition-colors focus-within:ring-2 focus-within:ring-brand ${
                form.duration === d
                  ? 'border-brand bg-brand/15 text-strong'
                  : 'border-subtle text-secondary hover:bg-fg/5'
              }`}
            >
              <input
                type="radio"
                name="castigo-duration"
                value={d}
                checked={form.duration === d}
                onChange={() => form.setDuration(d)}
                className="sr-only"
              />
              {durationLabel(d)}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-col gap-2">
        {form.canVote && (
          <>
            <Button
              className="min-h-10 w-full"
              disabled={!picked || form.busy}
              onClick={() => void form.startVote()}
            >
              {CASTIGO_COPY.startVote}
            </Button>
            <p className="text-ds-xs text-muted">{CASTIGO_COPY.voteHint}</p>
          </>
        )}
        {form.showDirect && (
          <Button
            variant="danger"
            className="min-h-10 w-full"
            disabled={!form.canDirect || form.busy}
            onClick={() => void form.applyNow()}
          >
            {CASTIGO_COPY.applyNow}
          </Button>
        )}
        {directHint && <p className="text-ds-xs text-muted">{directHint}</p>}
      </div>
    </div>
  )
}

export default CastigoModal
