import { describe, expect, it, vi } from 'vitest'

// Sem DOM: o portal vira o próprio conteúdo.
vi.mock('react-dom', async (original) => ({
  ...(await original<typeof import('react-dom')>()),
  createPortal: (node: React.ReactNode) => node
}))
vi.stubGlobal('document', { body: {} })
// O store de verdade puxa o áudio do LiveKit.
vi.mock('../store/soundboardStore', () => ({
  useSoundboardStore: (sel: (s: { uploadSound: () => void }) => unknown) => sel({ uploadSound: () => {} })
}))

import { createRef } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import SoundboardUploadModal from './SoundboardUploadModal'
import { SoundEmojiField, SoundFileField, SoundUploadActions } from './SoundboardUploadFields'

const noop = (): void => {}

describe('SoundboardUploadModal', () => {
  it('fechado, nada', () => {
    expect(renderToStaticMarkup(<SoundboardUploadModal open={false} serverId="s" onClose={noop} />)).toBe('')
  })

  it('aberto: título, fechar, campos e Salvar travado sem arquivo', () => {
    const html = renderToStaticMarkup(<SoundboardUploadModal open serverId="s" onClose={noop} />)
    expect(html).toContain('Adicionar som à mesa de áudio')
    // É o Modal do app: diálogo de verdade, rotulado pelo título do cabeçalho único.
    expect(html).toMatch(/role="dialog" aria-modal="true" aria-labelledby="([^"]+)"[^]*<h2 id="\1"[^>]*>Adicionar som/)
    expect(html).toContain('aria-label="Fechar"')
    expect(html).not.toContain('✕')
    expect(html).toContain('Escolher arquivo')
    expect(html).toContain('aria-label="Emoji personalizado"')
    expect(html).toMatch(/disabled=""[^>]*>Salvar na mesa</)
  })
})

describe('SoundboardUploadFields', () => {
  const file = new File(['x'.repeat(2458)], 'corneta.mp3')
  const refs = { fileInputRef: createRef<HTMLInputElement>(), previewAudioRef: createRef<HTMLAudioElement>() }

  it('com arquivo: nome, duração e tamanho, e a prévia tocando', () => {
    const html = renderToStaticMarkup(
      <SoundFileField
        {...refs}
        file={file}
        durationMs={1500}
        previewUrl="blob:x"
        previewPlaying
        onPick={noop}
        onTogglePreview={noop}
        onPreviewEnded={noop}
      />
    )
    expect(html).toContain('corneta.mp3')
    // Duração e tamanho no formato do resto do app (vírgula decimal, unidade separada).
    expect(html).toContain('1,5 s · 2,4 KB')
    expect(html).toContain('title="Parar prévia"')
    expect(html).toContain('<audio')
  })

  it('emoji escolhido fica destacado', () => {
    const html = renderToStaticMarkup(<SoundEmojiField emoji="🔥" onChange={noop} />)
    expect(html).toMatch(/bg-brand[^"]*">🔥</)
  })

  it('salvar libera com arquivo e nome; enviando mostra o texto de espera', () => {
    expect(renderToStaticMarkup(<SoundUploadActions file={file} name="x" submitting={false} onCancel={noop} />)).not.toContain('disabled=""')
    expect(renderToStaticMarkup(<SoundUploadActions file={file} name="x" submitting onCancel={noop} />)).toContain('Enviando…')
  })
})
