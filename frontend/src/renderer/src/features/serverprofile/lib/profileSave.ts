// Salvar o formulário do perfil: o nome e o ícone vão pelo domínio server (as
// ações que já existem) e o resto pelo perfil. Puro, a não ser pelo aviso de erro.

import { showToast } from '../../../shared/store/toastStore'
import type { MediaChange } from '../../profile/lib/profileValidation'
import type { Server } from '../../servers/api/servers'
import { actionErrorMessage } from '../../servers/lib/permissionErrors'

export interface BasicsActions {
  updateServer: (id: string, name: string) => Promise<unknown>
  setServerIcon: (id: string, icon: { file: File | Blob; staticFrame?: Blob } | null) => Promise<unknown>
}

export function basicsDirty(server: Pick<Server, 'name'>, name: string, icon: MediaChange): boolean {
  return name.trim() !== server.name || icon.kind !== 'keep'
}

/** O ícone que a prévia mostra. */
export function shownIcon(icon: MediaChange, current: string | null | undefined): string | null | undefined {
  if (icon.kind === 'set') return icon.previewUrl
  return icon.kind === 'remove' ? null : current
}

async function saveBasics(server: Pick<Server, 'id' | 'name'>, name: string, icon: MediaChange, actions: BasicsActions): Promise<void> {
  const trimmed = name.trim()
  if (trimmed !== server.name) await actions.updateServer(server.id, trimmed)
  if (icon.kind === 'set') await actions.setServerIcon(server.id, { file: icon.file, staticFrame: icon.staticFrame })
  if (icon.kind === 'remove') await actions.setServerIcon(server.id, null)
}

export interface ProfileFormSave {
  server: Pick<Server, 'id' | 'name'>
  name: string
  icon: MediaChange
  actions: BasicsActions
  /** O ícone já subiu: não envia de novo se o perfil falhar. */
  onBasicsSaved: () => void
  draftDirty: boolean
  saveDraft: () => Promise<boolean>
}

/** Salva tudo; devolve se deu certo (o erro já virou aviso). */
export async function saveProfileForm(form: ProfileFormSave): Promise<boolean> {
  try {
    await saveBasics(form.server, form.name, form.icon, form.actions)
    form.onBasicsSaved()
  } catch (err) {
    showToast.error(actionErrorMessage(err, 'Falha ao salvar servidor.'))
    return false
  }
  return form.draftDirty ? form.saveDraft() : true
}
