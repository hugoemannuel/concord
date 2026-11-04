import { useEffect, useMemo, useState } from 'react'
import { showToast } from '../../../shared/store/toastStore'
import { actionErrorMessage } from '../../servers/lib/permissionErrors'
import { getServerCard, type ServerCard } from '../api/serverProfile'
import { savePatch } from '../lib/draftRequests'
import {
  draftFromProfile,
  patchFromDraft,
  previewCard,
  type ProfileDraft
} from '../lib/profileDraft'
import { useServerProfileStore } from '../store/serverProfileStore'

export interface ProfileDraftState {
  /** null enquanto carrega (ou sem acesso). */
  card: ServerCard | null
  draft: ProfileDraft | null
  /** O cartão com o rascunho por cima, para a prévia. */
  preview: ServerCard | null
  dirty: boolean
  saving: boolean
  change: (patch: Partial<ProfileDraft>) => void
  reset: () => void
  /** Salva o que mudou. Devolve se deu certo (o erro já virou aviso). */
  save: () => Promise<boolean>
}

/** O formulário de uma seção de customização: o salvo, o rascunho e o salvar. */
export function useProfileDraft(serverId: string): ProfileDraftState {
  const [card, setCard] = useState<ServerCard | null>(null)
  const [draft, setDraft] = useState<ProfileDraft | null>(null)
  const [saving, setSaving] = useState(false)

  const adopt = (next: ServerCard): void => {
    setCard(next)
    setDraft(next.profile ? draftFromProfile(next.profile) : null)
    useServerProfileStore.getState().setCard(serverId, next)
  }

  useEffect(() => {
    let cancelled = false
    getServerCard(serverId)
      .then((next) => !cancelled && adopt(next))
      .catch((err: unknown) => {
        if (!cancelled) showToast.error(actionErrorMessage(err, 'Não foi possível abrir o perfil do servidor.'))
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- adopt só usa serverId.
  }, [serverId])

  const profile = card?.profile
  const patch = useMemo(() => (profile && draft ? patchFromDraft(profile, draft) : {}), [profile, draft])
  const preview = useMemo(() => previewCard(card, draft, serverId), [card, draft, serverId])

  return {
    card,
    draft,
    preview,
    dirty: Object.keys(patch).length > 0,
    saving,
    change: (next) => setDraft((d) => (d ? { ...d, ...next } : d)),
    reset: () => setDraft(profile ? draftFromProfile(profile) : null),
    save: async () => {
      setSaving(true)
      const next = await savePatch(serverId, patch)
      setSaving(false)
      if (next) adopt(next)
      return next !== null
    }
  }
}
