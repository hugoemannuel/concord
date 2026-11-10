import { describe, expect, it } from 'vitest'
import { QUICK_EMOTES } from './emotes'
import {
  menuKeyAction,
  menuPosition,
  messageMenuGroups,
  quickReactions,
  type MessageMenuInput
} from './messageMenu'

describe('quickReactions', () => {
  it('3 reações rápidas: as primeiras das atuais (ainda não há "mais usadas")', () => {
    expect(quickReactions()).toEqual(QUICK_EMOTES.slice(0, 3))
    expect(quickReactions()).toHaveLength(3)
  })

  it('respeita a lista e a quantidade, sem repetir', () => {
    expect(quickReactions(['😀', '😀', '🔥', '👍'], 2)).toEqual(['😀', '🔥'])
    expect(quickReactions(['😀'], 3)).toEqual(['😀'])
  })
})

const all: MessageMenuInput = {
  canReact: true,
  canEdit: true,
  canPin: true,
  isPinned: false,
  canCopy: true,
  canDelete: true,
  deleteLabel: 'Excluir mensagem'
}

const labels = (groups: ReturnType<typeof messageMenuGroups>): string[][] =>
  groups.map((g) => g.map((i) => i.label))

describe('messageMenuGroups', () => {
  it('minha mensagem com tudo: grupos como no Discord, excluir por último e em vermelho', () => {
    const groups = messageMenuGroups(all)
    expect(labels(groups)).toEqual([
      ['Adicionar reação', 'Editar mensagem', 'Responder'],
      ['Fixar mensagem', 'Copiar texto'],
      ['Excluir mensagem']
    ])
    expect(groups[2][0]).toMatchObject({ action: 'delete', danger: true })
    expect(groups[0].every((i) => !i.danger)).toBe(true)
  })

  it('encaminhar entra depois de responder, quando dá para encaminhar', () => {
    expect(labels(messageMenuGroups({ ...all, canForward: true }))[0]).toEqual([
      'Adicionar reação',
      'Editar mensagem',
      'Responder',
      'Encaminhar'
    ])
    expect(messageMenuGroups({ ...all, canForward: true })[0][3]).toMatchObject({ action: 'forward' })
  })

  it('mensagem fixada: oferece desafixar', () => {
    const groups = messageMenuGroups({ ...all, isPinned: true })
    expect(groups[1][0]).toMatchObject({ action: 'unpin', label: 'Desafixar mensagem' })
  })

  it('mensagem de outra pessoa, sem moderação: só reagir, responder e copiar', () => {
    const groups = messageMenuGroups({
      ...all,
      canEdit: false,
      canPin: false,
      canDelete: false
    })
    expect(labels(groups)).toEqual([['Adicionar reação', 'Responder'], ['Copiar texto']])
  })

  it('sem permissão de reagir e sem texto: some o grupo vazio', () => {
    const groups = messageMenuGroups({
      ...all,
      canReact: false,
      canEdit: false,
      canPin: false,
      canCopy: false,
      canDelete: false
    })
    expect(labels(groups)).toEqual([['Responder']])
  })

  it('o rótulo de excluir vem de fora (moderação, comentário)', () => {
    const groups = messageMenuGroups({ ...all, deleteLabel: 'Excluir mensagem (moderação)' })
    expect(groups[2][0].label).toBe('Excluir mensagem (moderação)')
  })

  it('favoritar fica junto de fixar e copiar', () => {
    const groups = messageMenuGroups({ ...all, canFavorite: true })
    expect(labels(groups)[1]).toEqual(['Fixar mensagem', 'Favoritar', 'Copiar texto'])
    expect(groups[1][1]).toMatchObject({ action: 'favorite' })
  })

  it('mensagem favorita: oferece remover das favoritas', () => {
    const groups = messageMenuGroups({ ...all, canFavorite: true, isFavorite: true })
    expect(groups[1][1]).toMatchObject({ action: 'unfavorite', label: 'Remover das favoritas' })
  })
})

describe('menuPosition', () => {
  const viewport = { width: 1280, height: 720 }
  const menu = { width: 220, height: 200 }

  it('abre embaixo do botão, alinhado pela direita dele', () => {
    const anchor = { top: 100, bottom: 132, left: 900, right: 932 }
    expect(menuPosition(anchor, menu, viewport)).toEqual({ left: 712, top: 136 })
  })

  it('sem espaço embaixo: abre em cima do botão', () => {
    const anchor = { top: 600, bottom: 632, left: 900, right: 932 }
    expect(menuPosition(anchor, menu, viewport).top).toBe(396)
  })

  it('não sai da tela na esquerda (tela estreita) nem na direita', () => {
    const narrow = { width: 360, height: 640 }
    expect(menuPosition({ top: 10, bottom: 42, left: 0, right: 40 }, menu, narrow).left).toBe(8)
    expect(menuPosition({ top: 10, bottom: 42, left: 340, right: 400 }, menu, narrow).left).toBe(
      132
    )
  })

  it('menu mais alto que a tela: fica colado na margem de cima', () => {
    const anchor = { top: 300, bottom: 332, left: 900, right: 932 }
    expect(menuPosition(anchor, { width: 220, height: 900 }, viewport).top).toBe(8)
  })
})

describe('menuKeyAction', () => {
  it('Esc e Tab fecham o menu', () => {
    expect(menuKeyAction('Escape', 0, 4)).toBe('close')
    expect(menuKeyAction('Tab', 2, 4)).toBe('close')
  })

  it('setas, Home e End andam entre os itens, dando a volta', () => {
    expect(menuKeyAction('ArrowDown', 3, 4)).toBe(0)
    expect(menuKeyAction('ArrowUp', 0, 4)).toBe(3)
    expect(menuKeyAction('End', 0, 4)).toBe(3)
  })

  it('outras teclas (Enter, letras) seguem para o item', () => {
    expect(menuKeyAction('Enter', 0, 4)).toBeNull()
    expect(menuKeyAction('a', 0, 4)).toBeNull()
  })
})
