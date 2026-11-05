import { describe, expect, it } from 'vitest'
import type { ServerProfile } from '../api/serverProfile'
import { draftFromProfile, patchFromDraft, overlayDraft, previewCard, EMPTY_TRAIT, MAX_TRAITS } from './profileDraft'

const profile: ServerProfile = {
  banner: { preset: 'azul', image: '' },
  traits: [{ emoji: '🎮', text: 'jogos' }],
  description: 'oi',
  games: [{ name: 'Dota 2' }],
  private: false,
  strip: { preset: '', image: '' },
  theme: { starter: '', image: '', dim: 50 },
  tag: { server_id: 's', name: 'ABC', badge: 'raio', color: '#000000' }
}

describe('draftFromProfile', () => {
  it('preenche os 5 campos de traço', () => {
    const draft = draftFromProfile(profile)
    expect(draft.traits).toHaveLength(MAX_TRAITS)
    expect(draft.traits[0].text).toBe('jogos')
    expect(draft.traits[4]).toEqual(EMPTY_TRAIT)
  })
})

describe('patchFromDraft', () => {
  it('sem mudança, patch vazio', () => {
    expect(patchFromDraft(profile, draftFromProfile(profile))).toEqual({})
  })

  it('manda só o que mudou (uma seção não desfaz a outra)', () => {
    const draft = { ...draftFromProfile(profile), description: 'novo', private: true }
    expect(patchFromDraft(profile, draft)).toEqual({ description: 'novo', private: true })
  })

  it('traços vazios não contam como mudança e saem do envio', () => {
    const draft = draftFromProfile(profile)
    draft.traits[1] = { emoji: '🎉', text: '  ' }
    expect(patchFromDraft(profile, draft)).toEqual({})
    draft.traits[1] = { emoji: '🎉', text: 'festa' }
    expect(patchFromDraft(profile, draft).traits).toEqual([
      { emoji: '🎮', text: 'jogos' },
      { emoji: '🎉', text: 'festa' }
    ])
  })

  it('descrição só com espaço a mais não é mudança', () => {
    const draft = { ...draftFromProfile(profile), description: ' oi ' }
    expect(patchFromDraft(profile, draft)).toEqual({})
  })

  it('tag: nome, emblema ou cor', () => {
    const draft = draftFromProfile(profile)
    draft.tag = { ...draft.tag, color: '#ffffff' }
    expect(patchFromDraft(profile, draft)).toEqual({ tag: { name: 'ABC', badge: 'raio', color: '#ffffff' } })
  })

  it('servidor sem tag: só cor e emblema padrão não criam tag', () => {
    const none = { ...profile, tag: null }
    const draft = draftFromProfile(none)
    expect(patchFromDraft(none, { ...draft, tag: { ...draft.tag, color: '#123456' } })).toEqual({})
  })
})

describe('overlayDraft', () => {
  it('a prévia mostra o rascunho, com a tag limpa', () => {
    const draft = { ...draftFromProfile(profile), description: 'prévia' }
    draft.traits[1] = { emoji: '', text: '  ' }
    const shown = overlayDraft(profile, draft, 's')
    expect(shown.description).toBe('prévia')
    expect(shown.traits).toHaveLength(1)
    expect(shown.tag?.name).toBe('ABC')
  })

  it('tag sem nome some da prévia', () => {
    const draft = draftFromProfile(profile)
    draft.tag = { ...draft.tag, name: '' }
    expect(overlayDraft(profile, draft, 's').tag).toBeNull()
  })
})

describe('previewCard', () => {
  const card = { locked: false, member_count: 1, online_count: 0, is_member: true, profile }
  it('o cartão com o rascunho', () => {
    const draft = { ...draftFromProfile(profile), description: 'novo' }
    expect(previewCard(card, draft, 's')?.profile?.description).toBe('novo')
  })
  it('sem cartão, sem perfil ou sem rascunho: nada', () => {
    const draft = draftFromProfile(profile)
    expect(previewCard(null, draft, 's')).toBeNull()
    expect(previewCard({ ...card, profile: undefined }, draft, 's')).toBeNull()
    expect(previewCard(card, null, 's')).toBeNull()
  })
})
