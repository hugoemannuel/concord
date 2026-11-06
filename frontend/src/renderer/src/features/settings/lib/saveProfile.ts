import { errorMessage } from '../../../shared/lib/errorMessage'
import type { User } from '../../auth/store/authStore'
import type { ProfileImageKind } from '../../profile/api/users'
import {
  draftFromProfile,
  fieldsChanged,
  profilePayload,
  type MediaChange,
  type ProfileDraft,
  type ProfileFields
} from '../../profile/lib/profileValidation'

// Sequência do "Salvar alterações" de Configurações → Perfis: avatar, banner
// e depois os campos de texto/tema. Cada passo que dá certo sai do rascunho:
// se um falhar, "Salvar" de novo só refaz o que faltou.

export interface SaveProfileDeps {
  /** O rascunho mais recente (muda a cada passo). */
  draft: () => ProfileDraft
  /** O usuário salvo mais recente (a sessão). */
  savedUser: () => User | null
  upload: (
    kind: ProfileImageKind,
    file: Blob,
    staticFrame: Blob | undefined,
    onProgress: (p: number) => void
  ) => Promise<User>
  remove: (kind: ProfileImageKind) => Promise<User>
  update: (fields: ProfileFields) => Promise<User>
  /** Grava o usuário que o servidor devolveu. */
  commit: (user: User) => void
  /** O avatar/banner já foi: volta a "manter". */
  keepMedia: (kind: ProfileImageKind) => void
  setProgress: (p: number | null) => void
  setDraft: (draft: ProfileDraft) => void
}

const MEDIA: ProfileImageKind[] = ['avatar', 'banner']

function sendMedia(
  kind: ProfileImageKind,
  change: Exclude<MediaChange, { kind: 'keep' }>,
  deps: SaveProfileDeps
): Promise<User> {
  if (change.kind === 'remove') return deps.remove(kind)
  deps.setProgress(0)
  return deps.upload(kind, change.file, change.staticFrame, deps.setProgress)
}

async function saveMedia(kind: ProfileImageKind, deps: SaveProfileDeps): Promise<void> {
  const change = deps.draft()[kind]
  if (change.kind === 'keep') return
  deps.setProgress(null)
  deps.commit(await sendMedia(kind, change, deps))
  deps.keepMedia(kind)
}

async function saveFields(deps: SaveProfileDeps): Promise<void> {
  const fresh = draftFromProfile(deps.savedUser() ?? {})
  if (!fieldsChanged(deps.draft(), fresh)) {
    deps.setDraft(fresh)
    return
  }
  const latest = await deps.update(profilePayload(deps.draft()))
  deps.commit(latest)
  deps.setDraft(draftFromProfile(latest))
}

/** Salva tudo o que mudou, na ordem; lança o erro do passo que falhou. */
export async function saveProfile(deps: SaveProfileDeps): Promise<void> {
  try {
    for (const kind of MEDIA) await saveMedia(kind, deps)
    deps.setProgress(null)
    await saveFields(deps)
  } finally {
    deps.setProgress(null)
  }
}

/** URL do avatar/banner mostrada na prévia: o rascunho por cima do salvo. */
export function previewMedia(change: MediaChange, saved: string | null | undefined): string | null {
  if (change.kind === 'set') return change.previewUrl
  if (change.kind === 'remove') return null
  return saved ?? null
}

/** Mensagem do erro ao salvar. */
export function saveErrorMessage(err: unknown): string {
  return errorMessage(err, 'Não foi possível salvar o perfil.')
}

