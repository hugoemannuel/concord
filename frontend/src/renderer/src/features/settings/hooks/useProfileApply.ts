import { useEffect, useRef, useState } from 'react'
import { useAuthStore, type User } from '../../auth/store/authStore'
import { commitMe } from '../../auth/store/accountActions'
import { showToast } from '../../../shared/store/toastStore'
import {
  deleteProfileImage,
  updateProfile,
  uploadProfileImage,
  type ProfileImageKind as ImageKind
} from '../../profile/api/users'
import { imageFileError, type MediaChange } from '../../profile/lib/profileValidation'
import { applyProfileChange, type ProfileChange } from '../lib/profileApply'
import { previewMedia } from '../lib/saveProfile'

export interface Cropping {
  file: File
  src: string
  kind: ImageKind
}

export interface ProfileApply {
  user: User | null
  /** Avatar e banner mostrados: a imagem que está subindo por cima da salva. */
  avatarUrl: string | null
  bannerUrl: string | null
  saving: boolean
  progress: number | null
  cropping: Cropping | null
  /** Salva a mudança na hora; true se deu certo (o modal fecha). */
  apply: (change: ProfileChange) => Promise<boolean>
  pickFile: (kind: ImageKind, file: File | undefined) => void
  /** Fecha o recorte; com a imagem recortada, já envia. */
  closeCrop: (change?: MediaChange) => void
}

type Uploading = Partial<Record<ImageKind, MediaChange>>

const revoke = (change: MediaChange | undefined): void => {
  if (change?.kind === 'set') URL.revokeObjectURL(change.previewUrl)
}

/**
 * Configurações → Perfis no jeito do Discord: cada "Aplicar" (modal ou
 * recorte de imagem) salva na hora. Enquanto a imagem sobe, o cartão já
 * mostra a nova.
 */
export function useProfileApply(): ProfileApply {
  const user = useAuthStore((s) => s.user)
  const [cropping, setCropping] = useState<Cropping | null>(null)
  const [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [uploading, setUploading] = useState<Uploading>({})

  // A prévia local (blob:) da imagem que está subindo morre com a tela.
  const uploadingRef = useRef(uploading)
  useEffect(() => {
    uploadingRef.current = uploading
  }, [uploading])
  useEffect(
    () => () => {
      revoke(uploadingRef.current.avatar)
      revoke(uploadingRef.current.banner)
    },
    []
  )

  const apply = async (change: ProfileChange): Promise<boolean> => {
    setSaving(true)
    const ok = await applyProfileChange(
      change,
      {
        savedUser: () => useAuthStore.getState().user,
        upload: uploadProfileImage,
        remove: deleteProfileImage,
        update: updateProfile,
        commit: commitMe,
        setProgress
      },
      showToast
    )
    setSaving(false)
    return ok
  }

  const sendMedia = async (kind: ImageKind, change: MediaChange): Promise<void> => {
    setUploading((u) => ({ ...u, [kind]: change }))
    await apply({ [kind]: change })
    revoke(change)
    setUploading((u) => ({ ...u, [kind]: undefined }))
  }

  const pickFile = (kind: ImageKind, file: File | undefined): void => {
    if (!file) return
    const error = imageFileError(file)
    if (error) {
      showToast.error(error)
      return
    }
    setCropping({ file, kind, src: URL.createObjectURL(file) })
  }

  const closeCrop = (change?: MediaChange): void => {
    if (!cropping) return
    URL.revokeObjectURL(cropping.src)
    setCropping(null)
    if (change) void sendMedia(cropping.kind, change)
  }

  return {
    user,
    avatarUrl: previewMedia(uploading.avatar ?? { kind: 'keep' }, user?.avatar_url),
    bannerUrl: previewMedia(uploading.banner ?? { kind: 'keep' }, user?.banner_url),
    saving,
    progress,
    cropping,
    apply,
    pickFile,
    closeCrop
  }
}
