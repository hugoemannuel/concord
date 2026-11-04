import { resetPatch, type MemberProfileField, type MemberProfileView } from './memberProfile'
import type { ServerMediaKind } from '../api/memberProfiles'

// "Voltar ao padrão" de um bloco e "Apagar perfil deste servidor".

export interface ServerResetDeps {
  view: () => MemberProfileView | null
  patch: (body: Record<string, unknown>) => Promise<MemberProfileView>
  resetImage: (kind: ServerMediaKind) => Promise<MemberProfileView>
  deleteProfile: () => Promise<MemberProfileView>
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
  field: MemberProfileField,
  deps: ServerResetDeps
): Promise<MemberProfileView> {
  if (field === 'cosmetics') {
    await deps.resetImage('nameplate')
    await deps.resetImage('decoration')
    return deps.patch({ nameplate_mode: null })
  }
  if (field === 'name') await clearNickname(deps)
  return deps.patch(resetPatch(field))
}

/** Apaga o perfil e, se a pessoa pode, o apelido: ela volta a ser só o global. */
export async function removeMemberProfile(deps: ServerResetDeps): Promise<MemberProfileView> {
  await clearNickname(deps)
  return deps.deleteProfile()
}
