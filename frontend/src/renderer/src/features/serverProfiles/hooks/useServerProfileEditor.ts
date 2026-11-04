import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuthStore } from '../../auth/store/authStore'
import { showToast } from '../../../shared/store/toastStore'
import type { ProfileImageKind } from '../../profile/api/users'
import { setMemberNickname } from '../../servers/api/servers'
import type { CosmeticsTarget } from '../../settings/hooks/useCosmeticsEditor'
import { useProfileEditing, type ProfileApply } from '../../settings/hooks/useProfileEditing'
import { saveErrorMessage } from '../../settings/lib/saveProfile'
import {
  deleteServerProfile,
  getServerProfile,
  patchServerProfile,
  resetServerProfileImage,
  uploadServerProfileImage
} from '../api/serverProfiles'
import { applyServerProfileChange } from '../lib/serverProfileApply'
import {
  removeServerProfile,
  resetServerField,
  type ServerResetDeps
} from '../lib/serverProfileResets'
import { effectiveUser, type ServerProfileField, type ServerProfileView } from '../lib/serverProfile'
import { useServerProfileStore } from '../store/serverProfileStore'

export interface ServerProfileEditor {
  profile: ProfileApply
  view: ServerProfileView | null
  failed: boolean
  cosmetics: CosmeticsTarget
  /** "Voltar ao padrão" de um bloco. */
  resetField: (field: ServerProfileField) => void
  resetMedia: (kind: ProfileImageKind) => void
  /** "Apagar perfil deste servidor": o perfil e o apelido, se a pessoa pode. */
  removeProfile: () => Promise<void>
}

/** O editor do meu perfil em um servidor (monte um por servidor, com `key`). */
export function useServerProfileEditor(serverId: string): ServerProfileEditor {
  const sessionUser = useAuthStore((s) => s.user)
  const [view, setView] = useState<ServerProfileView | null>(null)
  const [failed, setFailed] = useState(false)
  const viewRef = useRef(view)

  const commit = useCallback(
    (next: ServerProfileView) => {
      viewRef.current = next
      setView(next)
      useServerProfileStore
        .getState()
        .apply(serverId, next.user_id, next.has_profile ? next.profile : null)
    },
    [serverId]
  )

  useEffect(() => {
    let cancelled = false
    getServerProfile(serverId)
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
    applyServerProfileChange(
      change,
      {
        user: () => useAuthStore.getState().user,
        view: () => viewRef.current,
        upload: (kind, file, staticFrame, onProgress) =>
          uploadServerProfileImage(serverId, kind, file, staticFrame, onProgress),
        reset: (kind) => resetServerProfileImage(serverId, kind),
        patch: (body) => patchServerProfile(serverId, body),
        setNickname,
        commit,
        setProgress
      },
      showToast
    )
  )

  const run = async (send: () => Promise<ServerProfileView>): Promise<void> => {
    try {
      commit(await send())
    } catch (err) {
      showToast.error(saveErrorMessage(err))
    }
  }

  const resets: ServerResetDeps = {
    view: () => viewRef.current,
    patch: (body) => patchServerProfile(serverId, body),
    resetImage: (kind) => resetServerProfileImage(serverId, kind),
    deleteProfile: () => deleteServerProfile(serverId),
    setNickname
  }

  return {
    profile,
    view,
    failed,
    cosmetics: {
      user,
      setMode: (mode) => run(() => patchServerProfile(serverId, { nameplate_mode: mode })),
      upload: (kind, file, staticFrame, onProgress) =>
        run(() => uploadServerProfileImage(serverId, kind, file, staticFrame, onProgress)),
      remove: (kind) => run(() => resetServerProfileImage(serverId, kind))
    },
    resetField: (field) => void run(() => resetServerField(field, resets)),
    resetMedia: (kind) => void run(() => resetServerProfileImage(serverId, kind)),
    removeProfile: async () => commit(await removeServerProfile(resets))
  }
}
