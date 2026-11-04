import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuthStore } from '../../auth/store/authStore'
import { showToast } from '../../../shared/store/toastStore'
import type { ProfileImageKind } from '../../profile/api/users'
import { setMemberNickname } from '../../servers/api/servers'
import type { CosmeticsTarget } from '../../settings/hooks/useCosmeticsEditor'
import { useProfileEditing, type ProfileApply } from '../../settings/hooks/useProfileEditing'
import { saveErrorMessage } from '../../settings/lib/saveProfile'
import {
  deleteMemberProfile,
  getMemberProfile,
  patchMemberProfile,
  resetMemberProfileImage,
  uploadMemberProfileImage
} from '../api/memberProfiles'
import { applyMemberProfileChange } from '../lib/memberProfileApply'
import {
  removeMemberProfile,
  resetServerField,
  type ServerResetDeps
} from '../lib/memberProfileResets'
import { effectiveUser, type MemberProfileField, type MemberProfileView } from '../lib/memberProfile'
import { useMemberProfileStore } from '../store/memberProfileStore'

export interface MemberProfileEditor {
  profile: ProfileApply
  view: MemberProfileView | null
  failed: boolean
  cosmetics: CosmeticsTarget
  /** "Voltar ao padrão" de um bloco. */
  resetField: (field: MemberProfileField) => void
  resetMedia: (kind: ProfileImageKind) => void
  /** "Apagar perfil deste servidor": o perfil e o apelido, se a pessoa pode. */
  removeProfile: () => Promise<void>
}

/** O editor do meu perfil em um servidor (monte um por servidor, com `key`). */
export function useMemberProfileEditor(serverId: string): MemberProfileEditor {
  const sessionUser = useAuthStore((s) => s.user)
  const [view, setView] = useState<MemberProfileView | null>(null)
  const [failed, setFailed] = useState(false)
  const viewRef = useRef(view)

  const commit = useCallback(
    (next: MemberProfileView) => {
      viewRef.current = next
      setView(next)
      useMemberProfileStore
        .getState()
        .apply(serverId, next.user_id, next.has_profile ? next.profile : null)
    },
    [serverId]
  )

  useEffect(() => {
    let cancelled = false
    getMemberProfile(serverId)
      .then((loaded) => {
        if (!cancelled) commit(loaded)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [serverId, commit])

  const user = useMemo(
    () => (sessionUser ? effectiveUser(sessionUser, view) : null),
    [sessionUser, view]
  )

  const setNickname = async (nickname: string): Promise<string | null> => {
    const me = useAuthStore.getState().user?.id ?? ''
    const res = await setMemberNickname(serverId, me, nickname)
    return res.nickname
  }

  const profile = useProfileEditing(user, (change, setProgress) =>
    applyMemberProfileChange(
      change,
      {
        user: () => useAuthStore.getState().user,
        view: () => viewRef.current,
        upload: (kind, file, staticFrame, onProgress) =>
          uploadMemberProfileImage(serverId, kind, file, staticFrame, onProgress),
        reset: (kind) => resetMemberProfileImage(serverId, kind),
        patch: (body) => patchMemberProfile(serverId, body),
        setNickname,
        commit,
        setProgress
      },
      showToast
    )
  )

  const run = async (send: () => Promise<MemberProfileView>): Promise<void> => {
    try {
      commit(await send())
    } catch (err) {
      showToast.error(saveErrorMessage(err))
    }
  }

  const resets: ServerResetDeps = {
    view: () => viewRef.current,
    patch: (body) => patchMemberProfile(serverId, body),
    resetImage: (kind) => resetMemberProfileImage(serverId, kind),
    deleteProfile: () => deleteMemberProfile(serverId),
    setNickname
  }

  return {
    profile,
    view,
    failed,
    cosmetics: {
      user,
      setMode: (mode) => run(() => patchMemberProfile(serverId, { nameplate_mode: mode })),
      upload: (kind, file, staticFrame, onProgress) =>
        run(() => uploadMemberProfileImage(serverId, kind, file, staticFrame, onProgress)),
      remove: (kind) => run(() => resetMemberProfileImage(serverId, kind))
    },
    resetField: (field) => void run(() => resetServerField(field, resets)),
    resetMedia: (kind) => void run(() => resetMemberProfileImage(serverId, kind)),
    removeProfile: async () => commit(await removeMemberProfile(resets))
  }
}
