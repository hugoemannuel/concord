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
import { nameplateEffect } from '../lib/cosmeticsEditor'
import { saveErrorMessage } from '../lib/saveProfile'

export interface CosmeticsCropping {
  file: File
  src: string
  kind: CosmeticImageKind
}

/**
 * O modal "Faixa e moldura": cada escolha vai direto para o servidor e o
 * usuário que volta atualiza a sessão (e a prévia). `pick` abre o arquivo de
 * quem chamou (o input escondido do tipo pedido).
 */
export function useCosmeticsEditor(pick: (kind: CosmeticImageKind) => void): {
  user: User | null
  busy: boolean
  cropping: CosmeticsCropping | null
  choose: (mode: NameplateMode) => void
  pickFile: (kind: CosmeticImageKind, file: File | undefined) => void
  closeCrop: (change?: MediaChange) => void
  remove: (kind: CosmeticImageKind) => void
} {
  const user = useAuthStore((s) => s.user)
  const [busy, setBusy] = useState(false)
  const [cropping, setCropping] = useState<CosmeticsCropping | null>(null)

  const run = async (send: () => Promise<User>): Promise<void> => {
    setBusy(true)
    try {
      commitMe(await send())
    } catch (err) {
      showToast.error(saveErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const choose = (mode: NameplateMode): void => {
    const effect = nameplateEffect(mode, user)
    if (effect === 'pick') pick('nameplate')
    else if (effect) void run(() => setNameplateMode(effect))
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
    void run(() => uploadCosmetic(cropping.kind, change.file, change.staticFrame)).finally(() =>
      URL.revokeObjectURL(change.previewUrl)
    )
  }

  const remove = (kind: CosmeticImageKind): void => void run(() => deleteCosmetic(kind))

  return { user, busy, cropping, choose, pickFile, closeCrop, remove }
}
