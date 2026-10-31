// Seções da tela de Configurações (navegação da esquerda, como no Discord) e a
// busca do topo.

export type SettingsSectionId =
  | 'account'
  | 'profiles'
  | 'privacy'
  | 'appearance'
  | 'voice'
  | 'video'
  | 'keybinds'
  | 'notifications'
  | 'app'

export interface SettingsSection {
  id: SettingsSectionId
  label: string
  group: 'user' | 'app'
  /** Palavras que a busca também encontra (o que tem dentro da seção). */
  keywords: string[]
}

export const SETTINGS_GROUPS: { id: SettingsSection['group']; label: string }[] = [
  { id: 'user', label: 'Configurações de usuário' },
  { id: 'app', label: 'Configurações do aplicativo' }
]

export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    id: 'account',
    label: 'Minha conta',
    group: 'user',
    keywords: ['conta', 'usuário', 'e-mail', 'email', 'nome de usuário', 'membro desde']
  },
  {
    id: 'profiles',
    label: 'Perfis',
    group: 'user',
    keywords: [
      'perfil',
      'avatar',
      'foto',
      'gif',
      'banner',
      'cor',
      'bio',
      'sobre mim',
      'pronomes',
      'nota',
      'links',
      'steam',
      'twitch',
      'aniversário',
      'som de entrada',
      'entrada na call',
      'personalizar',
      'efeito',
      'borda',
      'fundo do perfil',
      'textura',
      'estilo do nome',
      'status',
      'invisível',
      'invisivel',
      'presença',
      'online',
      'ausente',
      'não perturbe'
    ]
  },
  {
    id: 'privacy',
    label: 'Privacidade e segurança',
    group: 'user',
    keywords: [
      'privacidade',
      'segurança',
      'bloquear',
      'bloqueados',
      'pedido de amizade',
      'amigos',
      'mensagem direta',
      'dm'
    ]
  },
  {
    id: 'appearance',
    label: 'Aparência',
    group: 'app',
    keywords: ['tema', 'cores', 'escuro', 'claro', 'modo escuro', 'amoled', 'contraste', 'sistema']
  },
  {
    id: 'voice',
    label: 'Voz e áudio',
    group: 'app',
    keywords: ['voz', 'microfone', 'saída', 'fone', 'ruído', 'rnnoise', 'teste do microfone']
  },
  {
    id: 'video',
    label: 'Vídeo',
    group: 'app',
    keywords: [
      'vídeo',
      'câmera',
      'camera',
      'webcam',
      'fundo',
      'plano de fundo',
      'desfoque',
      'borrar',
      'prévia',
      'imagem'
    ]
  },
  {
    id: 'keybinds',
    label: 'Atalhos',
    group: 'app',
    keywords: [
      'atalhos',
      'teclas',
      'teclado',
      'mouse',
      'botão',
      'mutar',
      'ensurdecer',
      'segundo plano',
      'global'
    ]
  },
  {
    id: 'notifications',
    label: 'Notificações',
    group: 'app',
    keywords: [
      'notificação',
      'som',
      'sons',
      'pacote de sons',
      'volume dos sons',
      'áudio próprio',
      'toque',
      'barra de tarefas',
      'área de trabalho',
      'não perturbe'
    ]
  },
  {
    id: 'app',
    label: 'Aplicativo',
    group: 'app',
    keywords: ['windows', 'iniciar', 'inicialização', 'overlay', 'jogos', 'opacidade']
  }
]

/** "Notificação" acha "notificacao" e vice-versa. */
const normalize = (text: string): string =>
  text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

export function filterSections(
  query: string,
  sections: SettingsSection[] = SETTINGS_SECTIONS
): SettingsSection[] {
  const q = normalize(query)
  if (!q) return sections
  return sections.filter((s) =>
    [s.label, ...s.keywords].some((text) => normalize(text).includes(q))
  )
}

/** Nome mostrado na conta: o de exibição, ou o @ se não houver. */
export function accountName(
  user: { display_name?: string; username?: string } | null | undefined
): string {
  return user?.display_name || user?.username || ''
}

/** A seção pedida; se ela não existe (some em algumas versões), a primeira. */
export function currentSettingsSection(
  sections: SettingsSection[],
  id: SettingsSectionId
): SettingsSection {
  return sections.find((s) => s.id === id) ?? sections[0]
}

/**
 * Largura da coluna do conteúdo: Perfis tem editor + prévia lado a lado e
 * precisa de mais espaço; o resto fica na coluna estreita de leitura.
 */
export function settingsContentWidth(id: SettingsSectionId): string {
  return id === 'profiles' ? 'max-w-[1080px]' : 'max-w-[740px]'
}

/**
 * O Esc fecha as configurações, menos quando já foi tratado (o recorte de
 * imagem para o evento) ou quando há um modal aberto por cima: o listener das
 * configurações roda antes do do modal, então o Esc é só do modal.
 */
export function escClosesSettings(
  e: { key: string; defaultPrevented: boolean },
  modalOpen: boolean
): boolean {
  return e.key === 'Escape' && !e.defaultPrevented && !modalOpen
}
