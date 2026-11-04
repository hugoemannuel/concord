import { describe, expect, it } from 'vitest'
import type { Proposal } from '../api/proposals'
import {
  archiveAllMessage,
  archivedOnLabel,
  archiveCountLabel,
  archivedToast,
  archiveStatusLabel,
  canArchive,
  dropArchived,
  mergePage,
  tabForKey,
  tabFromParam
} from './archive'
import { mergeProposal } from './proposals'

const card = (id: string, status: Proposal['status'] = 'done', over: Partial<Proposal> = {}): Proposal => ({
  id,
  author_id: 'u1',
  author_name: 'Ana',
  title: `Card ${id}`,
  description: '',
  status,
  created_at: '2026-10-01T00:00:00Z',
  voting_ends_at: '2026-10-08T00:00:00Z',
  yes_votes: 0,
  no_votes: 0,
  comment_count: 0,
  images: [],
  ...over
})

describe('canArchive', () => {
  it('só o time tech arquiva, e só concluída ou recusada ainda no quadro', () => {
    expect(canArchive(card('a', 'done'), true)).toBe(true)
    expect(canArchive(card('a', 'rejected'), true)).toBe(true)
    expect(canArchive(card('a', 'done'), false)).toBe(false)
    for (const s of ['voting', 'proposed', 'in_progress'] as const) {
      expect(canArchive(card('a', s), true), s).toBe(false)
    }
    expect(canArchive(card('a', 'done', { archived_at: '2026-10-02T00:00:00Z' }), true)).toBe(false)
  })
})

describe('dropArchived', () => {
  it('tira da lista só as ids arquivadas', () => {
    const list = [card('a'), card('b'), card('c')]
    expect(dropArchived(list, ['a', 'c']).map((p) => p.id)).toEqual(['b'])
    expect(dropArchived(list, [])).toBe(list)
  })
})

describe('mergePage', () => {
  it('junta a página nova sem repetir card (a lista pode ter andado entre as páginas)', () => {
    const merged = mergePage([card('a'), card('b')], [card('b', 'done', { title: 'novo' }), card('c')])
    expect(merged.map((p) => p.id)).toEqual(['a', 'b', 'c'])
    expect(merged[1].title).toBe('novo')
  })
})

describe('textos', () => {
  it('rótulo do botão em lote, com singular e plural', () => {
    expect(archiveCountLabel('done', 1)).toBe('Arquivar concluída')
    expect(archiveCountLabel('done', 3)).toBe('Arquivar concluídas')
    expect(archiveCountLabel('rejected', 1)).toBe('Arquivar recusada')
    expect(archiveCountLabel('rejected', 2)).toBe('Arquivar recusadas')
  })
  it('status no cartão arquivado', () => {
    expect(archiveStatusLabel('done')).toBe('Concluída')
    expect(archiveStatusLabel('rejected')).toBe('Recusada')
    expect(archiveStatusLabel('voting')).toBe('Em votação')
  })
})

describe('textos de aviso e confirmação', () => {
  it('aviso depois de arquivar', () => {
    expect(archivedToast(1)).toBe('1 proposta arquivada')
    expect(archivedToast(4)).toBe('4 propostas arquivadas')
  })
  it('a confirmação diz quantas saem e que nada é apagado', () => {
    expect(archiveAllMessage('done', 3)).toBe(
      'As 3 propostas concluídas saem do quadro para todo mundo. Nada é apagado: elas ficam na aba Arquivadas e o time tech pode desarquivar.'
    )
    expect(archiveAllMessage('rejected', 1)).toContain('A proposta recusada sai do quadro')
    expect(archiveAllMessage('rejected', 1)).toContain('ela fica na aba Arquivadas')
  })
})

describe('mergeProposal com arquivadas', () => {
  it('evento de card arquivado não devolve o card ao quadro', () => {
    const list = [card('a'), card('b')]
    const archived = card('a', 'done', { archived_at: '2026-10-02T00:00:00Z' })
    expect(mergeProposal(list, archived).map((p) => p.id)).toEqual(['b'])
    expect(mergeProposal([card('b')], archived).map((p) => p.id)).toEqual(['b'])
  })
})

describe('archivedOnLabel', () => {
  it('formata a data em português; vazio ou inválido não mostra nada', () => {
    expect(archivedOnLabel('2026-10-12T15:00:00Z')).toMatch(/^Arquivada em 12 de out\.? de 2026$/)
    expect(archivedOnLabel(null)).toBe('')
    expect(archivedOnLabel('lixo')).toBe('')
  })
})

describe('abas', () => {
  it('?aba=arquivadas abre as arquivadas; o resto é o quadro', () => {
    expect(tabFromParam('arquivadas')).toBe('archived')
    expect(tabFromParam(null)).toBe('board')
    expect(tabFromParam('x')).toBe('board')
  })
  it('teclado: setas alternam, Home/End vão às pontas, o resto é ignorado', () => {
    expect(tabForKey('board', 'ArrowRight')).toBe('archived')
    expect(tabForKey('archived', 'ArrowLeft')).toBe('board')
    expect(tabForKey('archived', 'Home')).toBe('board')
    expect(tabForKey('board', 'End')).toBe('archived')
    expect(tabForKey('board', 'a')).toBeNull()
  })
})
