import { errorMessage } from '../../../shared/lib/errorMessage'

/** O que renomear o grupo usa de fora (API, recarregar conversas e aviso). */
export interface GroupRenameDeps {
  rename: (conversationId: string, name: string) => Promise<unknown>
  refresh: () => Promise<unknown>
  error: (message: string) => void
}

/** Salva o nome editado; sem edição ou com o mesmo nome, não chama a API. */
export async function saveGroupName(
  deps: GroupRenameDeps,
  conv: { id: string; name: string },
  name: string | null
): Promise<void> {
  if (name === null || name.trim() === conv.name.trim()) return
  try {
    await deps.rename(conv.id, name)
    await deps.refresh()
  } catch (err) {
    deps.error(errorMessage(err, 'Não foi possível renomear.'))
  }
}
