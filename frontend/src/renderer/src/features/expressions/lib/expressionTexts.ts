import { formatSoundDuration, type ExpressionKind } from './expressionRules'

// Textos da gestão de emojis, figurinhas e sons nas configurações do servidor.

export interface ExpressionTexts {
  description: string
  add: string
  empty: string
  loadError: string
  edit: string
  remove: string
  deleteTitle: string
  deleteBody: (name: string) => string
  editFail: string
  deleteFail: string
}

const IRREVERSIBLE = 'Esta ação não pode ser desfeita.'

export const EXPRESSION_TEXTS: Record<ExpressionKind, ExpressionTexts> = {
  emoji: {
    description: 'Emojis personalizados que os membros podem usar nas mensagens e reações.',
    add: 'Adicionar emoji',
    empty: 'Este servidor ainda não tem emojis personalizados.',
    loadError: 'Não foi possível carregar os emojis.',
    edit: 'Editar emoji',
    remove: 'Apagar emoji',
    deleteTitle: 'Apagar emoji',
    deleteBody: (name) => `O emoji ${name} será apagado deste servidor. ${IRREVERSIBLE}`,
    editFail: 'Não foi possível editar o emoji.',
    deleteFail: 'Não foi possível apagar o emoji.'
  },
  sticker: {
    description: 'Figurinhas que os membros podem enviar nas conversas.',
    add: 'Adicionar figurinha',
    empty: 'Este servidor ainda não tem figurinhas.',
    loadError: 'Não foi possível carregar as figurinhas.',
    edit: 'Editar figurinha',
    remove: 'Apagar figurinha',
    deleteTitle: 'Apagar figurinha',
    deleteBody: (name) => `A figurinha ${name} será apagada deste servidor. ${IRREVERSIBLE}`,
    editFail: 'Não foi possível editar a figurinha.',
    deleteFail: 'Não foi possível apagar a figurinha.'
  },
  sound: {
    description: 'Sons que os membros podem tocar na mesa de áudio das chamadas.',
    add: 'Adicionar som',
    empty: 'Este servidor ainda não tem sons.',
    loadError: 'Não foi possível carregar os sons.',
    edit: 'Editar som',
    remove: 'Apagar som',
    deleteTitle: 'Apagar som',
    deleteBody: (name) => `O som ${name} será apagado deste servidor. ${IRREVERSIBLE}`,
    editFail: 'Não foi possível editar o som.',
    deleteFail: 'Não foi possível apagar o som.'
  }
}

/** Como o item aparece na lista: o emoji entre dois-pontos (":festa:"). */
export function expressionDisplayName(kind: ExpressionKind, name: string): string {
  return kind === 'emoji' ? `:${name}:` : name
}

/** "Enviado por Ana" (o servidor nem sempre manda o nome). */
export function uploaderMeta(uploaderName: string | undefined): string | undefined {
  return uploaderName ? `Enviado por ${uploaderName}` : undefined
}

/** "1,5 s · Enviado por Ana". */
export function soundMeta(durationMs: number, uploaderName: string | undefined): string {
  return [formatSoundDuration(durationMs), uploaderMeta(uploaderName)].filter(Boolean).join(' · ')
}
