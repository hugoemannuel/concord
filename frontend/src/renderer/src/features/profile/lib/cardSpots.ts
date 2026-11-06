// Partes do cartão de perfil que dá para editar clicando nelas (Configurações
// → Perfis). Avatar e banner abrem o seletor de arquivo; o resto, um modal.

export type CardSpot = 'avatar' | 'banner' | 'name' | 'pronouns' | 'note' | 'bio' | 'links'

export const SPOT_LABEL: Record<CardSpot, string> = {
  avatar: 'Alterar avatar',
  banner: 'Alterar banner',
  name: 'Editar nome de exibição',
  pronouns: 'Editar pronomes',
  note: 'Editar nota',
  bio: 'Editar sobre mim',
  links: 'Editar links'
}

/** O que aparece no lugar de uma parte vazia, só no editor. */
export const SPOT_PLACEHOLDER = {
  note: 'No que você está pensando?',
  pronouns: 'Adicionar pronomes',
  bio: 'Adicionar um Sobre mim',
  links: 'Adicionar links'
} as const

export const spotOpensFile = (spot: CardSpot): spot is 'avatar' | 'banner' =>
  spot === 'avatar' || spot === 'banner'
