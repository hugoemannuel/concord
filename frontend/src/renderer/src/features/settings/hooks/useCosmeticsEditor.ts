import { useState } from 'react'
import { useAuthStore, type User } from '../../auth/store/authStore'
import { commitMe } from '../../auth/store/accountActions'
import { showToast } from '../../../shared/store/toastStore'
import {
  deleteCosmetic,
  setNameplateMode,
  uploadCosmetic,
  type CosmeticImageKind
} from '../../profile/api/users'
import type { NameplateMode } from '../../profile/lib/cosmetics'
import { imageFileError, type MediaChange } from '../../profile/lib/profileValidation'
import {
  nameplateEffect,
  previewCosmeticsUser,
  type UploadingCosmetic
} from '../lib/cosmeticsEditor'
import { savingLabel } from '../lib/profileTiles'
import { saveErrorMessage } from '../lib/saveProfile'

export interface CosmeticsCropping {
  file: File
  src: string
  kind: CosmeticImageKind
}

/** Como cada escolha é salva: no perfil global ou no de um servidor. */
export interface CosmeticsTarget {
  user: User | null
  setMode: (mode: NameplateMode) => Promise<void>
  upload: (
    kind: CosmeticImageKind,
    file: Blob,
    staticFrame: Blob | undefined,
    onProgress: (fraction: number) => void
  ) => Promise<void>
  remove: (kind: CosmeticImageKind) => Promise<void>
}

const GLOBAL_ACTIONS: Omit<CosmeticsTarget, 'user'> = {
  setMode: async (mode) => commitMe(await setNameplateMode(mode)),
  upload: async (kind, file, staticFrame, onProgress) =>
    commitMe(await uploadCosmetic(kind, file, staticFrame, onProgress)),
  remove: async (kind) => commitMe(await deleteCosmetic(kind))
}

/**
 * O modal "Faixa e moldura": cada escolha vai direto para o servidor e o
 * usuário que volta atualiza a sessão (e a prévia). `pick` abre o arquivo de
 * quem chamou (o input escondido do tipo pedido).
 */
export function useCosmeticsEditor(
  pick: (kind: CosmeticImageKind) => void,
  /** Sem ele, o perfil global da sessão. */
  target?: CosmeticsTarget
): {
  user: User | null
  busy: boolean
  status: string | null
  animatedPreview: boolean
  cropping: CosmeticsCropping | null
  choose: (mode: NameplateMode) => void
  pickFile: (kind: CosmeticImageKind, file: File | undefined) => void
  closeCrop: (change?: MediaChange) => void
  remove: (kind: CosmeticImageKind) => void
} {
  const sessionUser = useAuthStore((s) => s.user)
  const user = target ? target.user : sessionUser
  const actions = target ?? GLOBAL_ACTIONS
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [uploading, setUploading] = useState<UploadingCosmetic | null>(null)
  const [cropping, setCropping] = useState<CosmeticsCropping | null>(null)

  const run = async (send: () => Promise<void>): Promise<void> => {
    setBusy(true)
    try {
      await send()
    } catch (err) {
      showToast.error(saveErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const choose = (mode: NameplateMode): void => {
    const effect = nameplateEffect(mode, user)
    if (effect === 'pick') pick('nameplate')
    else void run(() => actions.setMode(effect))
  }

  const pickFile = (kind: CosmeticImageKind, file: File | undefined): void => {
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
    if (change?.kind !== 'set') return
    setUploading({ kind: cropping.kind, previewUrl: change.previewUrl, animated: change.animated })
    setProgress(0)
    void run(() =>
      actions.upload(cropping.kind, change.file, change.staticFrame, setProgress)
    ).finally(() => {
      setUploading(null)
      setProgress(null)
      URL.revokeObjectURL(change.previewUrl)
    })
  }

  const remove = (kind: CosmeticImageKind): void => void run(() => actions.remove(kind))

  return {
    user: user ? previewCosmeticsUser(user, uploading) : null,
    busy,
    status: savingLabel(busy, progress),
    animatedPreview: Boolean(uploading?.animated),
    cropping,
    choose,
    pickFile,
    closeCrop,
    remove
  }
}
