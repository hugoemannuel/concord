import { resetPatch, type ServerProfileField, type ServerProfileView } from './serverProfile'
import type { ServerMediaKind } from '../api/serverProfiles'

// "Voltar ao padrão" de um bloco e "Apagar perfil deste servidor".

export interface ServerResetDeps {
  view: () => ServerProfileView | null
  patch: (body: Record<string, unknown>) => Promise<ServerProfileView>
  resetImage: (kind: ServerMediaKind) => Promise<ServerProfileView>
  deleteProfile: () => Promise<ServerProfileView>
  setNickname: (nickname: string) => Promise<unknown>
}

/** Tira o apelido, se a pessoa pode e se há um. true = tirou. */
async function clearNickname(deps: ServerResetDeps): Promise<boolean> {
  const view = deps.view()
  if (!view?.nickname || !view.can_change_nickname) return false
  await deps.setNickname('')
  return true
}

/** O nome é o apelido mais o estilo; a faixa e a moldura têm rotas próprias. */
export async function resetServerField(
  field: ServerProfileField,
  deps: ServerResetDeps
): Promise<ServerProfileView> {
  if (field === 'cosmetics') {
    await deps.resetImage('nameplate')
    await deps.resetImage('decoration')
    return deps.patch({ nameplate_mode: null })
  }
  if (field === 'name') await clearNickname(deps)
  return deps.patch(resetPatch(field))
}

/** Apaga o perfil e, se a pessoa pode, o apelido: ela volta a ser só o global. */
export async function removeServerProfile(deps: ServerResetDeps): Promise<ServerProfileView> {
  await clearNickname(deps)
  return deps.deleteProfile()
}
