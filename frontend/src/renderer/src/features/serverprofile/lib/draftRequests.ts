// Os pedidos do editor: viram resultado ou null com o aviso já mostrado, para os
// hooks só cuidarem do estado.

import { showToast } from '../../../shared/store/toastStore'
import { imageFileProblem, shrinkImage } from '../../appearance/lib/themeImageFile'
import { actionErrorMessage } from '../../servers/lib/permissionErrors'
import {
  applyServerTag,
  clearServerTag,
  updateServerProfile,
  uploadServerProfileImage,
  type ProfilePatch,
  type ServerCard,
  type ServerTag
} from '../api/serverProfile'

export async function savePatch(serverId: string, patch: ProfilePatch): Promise<ServerCard | null> {
  try {
    return await updateServerProfile(serverId, patch)
  } catch (err) {
    showToast.error(actionErrorMessage(err, 'Não foi possível salvar.'))
    return null
  }
}

/** Confere, reduz e envia a imagem; devolve a URL (quem grava é o salvar). */
export async function uploadPicked(serverId: string, file: File): Promise<string | null> {
  const problem = imageFileProblem(file)
  if (problem) {
    showToast.error(problem)
    return null
  }
  try {
    return await uploadServerProfileImage(serverId, await shrinkImage(file))
  } catch {
    showToast.error('Não foi possível enviar a imagem. Tente de novo.')
    return null
  }
}

/** Usa a tag do servidor (null = deixa de usar) e devolve a que ficou em uso. */
export async function chooseMyTag(serverId: string | null): Promise<ServerTag | null> {
  if (serverId) return (await applyServerTag(serverId)).tag
  await clearServerTag()
  return null
}
