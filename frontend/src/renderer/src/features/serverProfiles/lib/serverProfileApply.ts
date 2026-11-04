import type { User } from '../../auth/store/authStore'
import type { ProfileImageKind } from '../../profile/api/users'
import {
  draftFromProfile,
  profilePayload,
  type MediaChange
} from '../../profile/lib/profileValidation'
import type { ProfileChange } from '../../settings/lib/profileApply'
import { saveErrorMessage } from '../../settings/lib/saveProfile'
import {
  effectiveUser,
  globalFieldValues,
  nicknameAction,
  patchFromFields,
  type FieldValues,
  type ServerProfileView
} from './serverProfile'

// "Aplicar" no perfil de um servidor: imagens primeiro, depois apelido e
// campos, cada um pelo caminho dele. Só vai para o servidor o que mudou.

export interface ServerApplyDeps {
  user: () => User | null
  view: () => ServerProfileView | null
  upload: (
    kind: ProfileImageKind,
    file: Blob,
    staticFrame: Blob | undefined,
    onProgress: (p: number) => void
  ) => Promise<ServerProfileView>
  reset: (kind: ProfileImageKind) => Promise<ServerProfileView>
  patch: (body: Record<string, unknown>) => Promise<ServerProfileView>
  setNickname: (nickname: string) => Promise<string | null>
  commit: (view: ServerProfileView) => void
  setProgress: (p: number | null) => void
}

const MEDIA: ProfileImageKind[] = ['avatar', 'banner']

function sendMedia(
  kind: ProfileImageKind,
  change: MediaChange | undefined,
  deps: ServerApplyDeps
): Promise<ServerProfileView> | null {
  if (!change || change.kind === 'keep') return null
  if (change.kind === 'remove') return deps.reset(kind)
  deps.setProgress(0)
  return deps.upload(kind, change.file, change.staticFrame, deps.setProgress)
}

const FIELD_KEYS: (keyof FieldValues)[] = [
  'pronouns',
  'bio',
  'status_text',
  'banner_color',
  'links',
  'name_style',
  'profile_theme'
]

function pick(source: FieldValues, keys: (keyof FieldValues)[]): Partial<FieldValues> {
  const out: Record<string, unknown> = {}
  for (const key of keys) out[key] = source[key]
  return out as Partial<FieldValues>
}

const sameStyle = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

/** Apelido primeiro: ele decide o que é "herdar" no estilo do nome. */
async function saveNickname(
  name: string | undefined,
  user: User,
  view: ServerProfileView,
  deps: ServerApplyDeps
): Promise<string | null> {
  const action = nicknameAction(name, view.nickname || user.display_name, user.display_name)
  if (!action.change || !view.can_change_nickname) return view.nickname
  const nickname = await deps.setNickname(action.nickname)
  deps.commit({ ...view, nickname })
  return nickname
}

async function saveFields(change: ProfileChange, deps: ServerApplyDeps): Promise<void> {
  const user = deps.user()
  const view = deps.view()
  if (!user || !view || !change.fields) return
  const nickname = await saveNickname(change.fields.display_name, user, view, deps)
  const before = draftFromProfile(effectiveUser(user, view))
  const shown = draftFromProfile(effectiveUser(user, { ...view, nickname }))
  const next = profilePayload({ ...before, ...change.fields })
  // Tirar o apelido sem mexer no estilo devolve o estilo global: nada a gravar.
  const keepsStyle = view.nickname && !nickname && sameStyle(next.name_style, before.name_style)
  const keys = FIELD_KEYS.filter((key) => key in change.fields! && !(key === 'name_style' && keepsStyle))
  const body = patchFromFields(pick(next, keys), shown, globalFieldValues(user, nickname))
  if (Object.keys(body).length > 0) deps.commit(await deps.patch(body))
}

/** Salva e avisa com um toast; devolve se deu certo (o modal fecha). */
export async function applyServerProfileChange(
  change: ProfileChange,
  deps: ServerApplyDeps,
  notify: { success: (msg: string) => void; error: (msg: string) => void }
): Promise<boolean> {
  try {
    for (const kind of MEDIA) {
      const sending = sendMedia(kind, change[kind], deps)
      if (sending) deps.commit(await sending)
    }
    deps.setProgress(null)
    await saveFields(change, deps)
    notify.success('Perfil do servidor salvo!')
    return true
  } catch (err) {
    notify.error(saveErrorMessage(err))
    return false
  } finally {
    deps.setProgress(null)
  }
}
