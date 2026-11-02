// Criar e editar canal (formulário da barra de canais). Sem React: quem chama
// passa as ações do servidor.
import type { Channel, ChannelType } from '../api/channels'

export interface ChannelFormInput {
  serverId: string
  /** Já no formato do servidor (channelSlug). */
  name: string
  editing: Channel | null
  type: ChannelType
  private: boolean
  roleIds: string[]
  categoryId?: string
}

export interface ChannelFormApi {
  create: (
    serverId: string,
    name: string,
    type: ChannelType,
    opts: { private: boolean; roleIds: string[]; categoryId?: string }
  ) => Promise<unknown>
  update: (serverId: string, channelId: string, name: string) => Promise<unknown>
  /** Recarrega os canais do servidor para as não lidas (chatStore). */
  refresh: (serverId: string) => void
}

/** Dá para enviar: tem nome, não está salvando e há servidor aberto. */
export function canSubmitChannel(name: string, saving: boolean, serverId: string): boolean {
  return name !== '' && !saving && serverId !== ''
}

/** Cria ou renomeia o canal; devolve o aviso de sucesso. */
export async function saveChannel(input: ChannelFormInput, api: ChannelFormApi): Promise<string> {
  if (input.editing) {
    await api.update(input.serverId, input.editing.id, input.name)
    api.refresh(input.serverId)
    return 'Canal atualizado!'
  }
  await api.create(input.serverId, input.name, input.type, {
    private: input.private,
    roleIds: input.roleIds,
    ...(input.categoryId ? { categoryId: input.categoryId } : {})
  })
  api.refresh(input.serverId)
  return input.type === 'voice'
    ? `Canal de voz ${input.name} criado!`
    : `Canal #${input.name} criado!`
}

/** Marca ou desmarca um cargo na lista de quem vê o canal privado. */
export function toggleRole(roleIds: string[], roleId: string, checked: boolean): string[] {
  return checked ? [...roleIds, roleId] : roleIds.filter((id) => id !== roleId)
}
