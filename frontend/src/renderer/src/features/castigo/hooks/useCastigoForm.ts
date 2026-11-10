import { useState } from 'react'
import { showToast } from '../../../shared/store/toastStore'
import { applyCastigo, startCastigoVote, type CastigoInput } from '../api/castigos'
import {
  canApplyDirect,
  hasAnyPower,
  type CastigoDuration,
  type CastigoEffects,
  type EffectKey
} from '../lib/castigo'
import { CASTIGO_COPY, castigoErrorMessage } from '../lib/castigoCopy'
import { useCastigoStore } from '../store/castigoStore'
import type { CastigoTarget } from '../store/castigoDialogStore'

export interface CastigoFormState {
  effects: CastigoEffects
  toggle: (key: EffectKey) => void
  duration: CastigoDuration
  setDuration: (d: CastigoDuration) => void
  busy: boolean
  /** Mostra o botão de castigar direto (tem alguma moderação de voz). */
  showDirect: boolean
  /** A escolha atual dá para castigar direto. */
  canDirect: boolean
  /** Dá para abrir votação (os dois estão na call). */
  canVote: boolean
  applyNow: () => Promise<void>
  startVote: () => Promise<void>
}

/** O formulário do castigo: o que tirar, por quanto tempo e as duas saídas. */
export function useCastigoForm(target: CastigoTarget, onDone: () => void): CastigoFormState {
  const [effects, setEffects] = useState<CastigoEffects>({
    speak: true,
    connect: false,
    listen: false
  })
  const [duration, setDuration] = useState<CastigoDuration>(300)
  const [busy, setBusy] = useState(false)

  const input = (): CastigoInput => ({ user_id: target.userId, effects, duration })

  const run = async (
    action: () => Promise<unknown>,
    ok: string,
    fallback: string
  ): Promise<void> => {
    setBusy(true)
    try {
      await action()
      showToast.success(ok)
      onDone()
    } catch (err) {
      showToast.error(castigoErrorMessage(err, fallback))
    } finally {
      setBusy(false)
    }
  }

  return {
    effects,
    toggle: (key) => setEffects((e) => ({ ...e, [key]: !e[key] })),
    duration,
    setDuration,
    busy,
    showDirect: hasAnyPower(target),
    canDirect: canApplyDirect(effects, target),
    canVote: Boolean(target.callId),
    applyNow: () =>
      run(
        async () => useCastigoStore.getState().upsert(await applyCastigo(target.serverId, input())),
        CASTIGO_COPY.applied(target.name),
        CASTIGO_COPY.failed
      ),
    startVote: () =>
      target.callId
        ? run(
            async () =>
              useCastigoStore.getState().setVote(await startCastigoVote(target.callId!, input())),
            CASTIGO_COPY.voteStarted,
            CASTIGO_COPY.voteFailedToStart
          )
        : Promise.resolve()
  }
}
