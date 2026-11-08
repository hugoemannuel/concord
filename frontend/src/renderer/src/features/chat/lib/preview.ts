// Prévia de mensagem (resposta, fixada, busca, comentário): o texto e, quando
// não é só texto, o tipo do conteúdo. O componente (PreviewText) desenha o
// ícone do tipo; aqui não há UI nem emoji.

import { stripMarkdown } from './markdown/stripMarkdown'

/** Tipo do conteúdo da prévia: vira o ícone de shared/ui/icons. */
export type PreviewKind = 'image' | 'video' | 'audio' | 'attachment' | 'sticker' | 'gif' | 'poll'

export interface Preview {
  icon: PreviewKind | null
  text: string
}

/** Prévia só de texto (sem ícone). */
export const textPreview = (text: string): Preview => ({ icon: null, text })

/** Prévia do texto da mensagem: sem os símbolos do Markdown nem o conteúdo do spoiler. */
export const markdownPreview = (content: string): Preview => textPreview(stripMarkdown(content))
