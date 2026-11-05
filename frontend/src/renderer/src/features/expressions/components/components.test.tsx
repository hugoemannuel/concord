import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { EXPRESSION_TEXTS } from '../lib/expressionTexts'
import ExpressionRow, { ExpressionRowActions } from './ExpressionRow'
import { ExpressionListBody, ExpressionToolbar } from './ExpressionListParts'
import NameEditForm from './NameEditForm'
import ExpressionManager, { type ExpressionManagerProps } from './ExpressionManager'
import { SoundThumb } from './ExpressionPreviews'

const texts = EXPRESSION_TEXTS.sticker
const noop = vi.fn()

describe('linha de uma expressão', () => {
  it('mostra a prévia, o nome e o detalhe; as ações só quando vierem', () => {
    const html = renderToStaticMarkup(
      <ExpressionRow preview={<i>img</i>} name="risada" meta="Enviado por Ana" />
    )
    expect(html).toContain('<i>img</i>')
    expect(html).toContain('risada')
    expect(html).toContain('Enviado por Ana')
    expect(html).not.toContain('<button')
  })

  it('editando, o formulário toma o lugar do nome', () => {
    const html = renderToStaticMarkup(
      <ExpressionRow
        preview={null}
        name="risada"
        editor={<form>editor</form>}
        actions={<b>ações</b>}
      />
    )
    expect(html).toContain('editor')
    expect(html).not.toContain('ações')
  })

  it('editar e apagar têm nome acessível', () => {
    const html = renderToStaticMarkup(
      <ExpressionRowActions
        editLabel="Editar figurinha"
        deleteLabel="Apagar figurinha"
        onEdit={noop}
        onDelete={noop}
      />
    )
    expect(html).toContain('aria-label="Editar figurinha"')
    expect(html).toContain('aria-label="Apagar figurinha"')
  })
})

describe('cabeçalho e corpo da lista', () => {
  it('conta "N de limite" e mostra o botão para quem pode enviar', () => {
    const html = renderToStaticMarkup(
      <ExpressionToolbar kind="sticker" texts={texts} count={2} canAdd onAdd={noop} />
    )
    expect(html).toContain('2 de 60 figurinhas')
    expect(html).toContain('Adicionar figurinha')
    expect(html).not.toContain('Limite atingido')
  })

  it('no limite, o botão trava e diz por quê; sem permissão, não aparece', () => {
    const full = renderToStaticMarkup(
      <ExpressionToolbar kind="sticker" texts={texts} count={60} canAdd onAdd={noop} />
    )
    expect(full).toContain('disabled')
    expect(full).toContain('Limite atingido')
    const none = renderToStaticMarkup(
      <ExpressionToolbar kind="sticker" texts={texts} count={0} canAdd={false} onAdd={noop} />
    )
    expect(none).not.toContain('Adicionar figurinha')
  })

  const body = (status: 'loading' | 'ready' | 'error', empty: boolean): string =>
    renderToStaticMarkup(
      <ExpressionListBody status={status} texts={texts} empty={empty} onRetry={noop}>
        <li>item</li>
      </ExpressionListBody>
    )

  it('carregando, erro com tentar de novo, vazio e a lista', () => {
    expect(body('loading', true)).toContain('aria-busy="true"')
    expect(body('error', true)).toContain(texts.loadError)
    expect(body('error', true)).toContain('Tentar de novo')
    expect(body('ready', true)).toContain(texts.empty)
    expect(body('ready', false)).toContain('<li>item</li>')
    // Já tinha a lista: recarregar não esconde o que está na tela.
    expect(body('loading', false)).toContain('<li>item</li>')
  })
})

describe('edição em linha', () => {
  it('nome com o valor atual; o campo do emoji só nos sons', () => {
    const sticker = renderToStaticMarkup(
      <NameEditForm kind="sticker" initialName="risada" failMessage="x" save={noop} onDone={noop} />
    )
    expect(sticker).toContain('value="risada"')
    expect(sticker).not.toContain('Emoji')
    expect(sticker).toContain('Salvar')
    expect(sticker).toContain('Cancelar')
    const sound = renderToStaticMarkup(
      <NameEditForm
        kind="sound"
        initialName="Corneta"
        initialEmoji=""
        failMessage="x"
        save={noop}
        onDone={noop}
      />
    )
    expect(sound).toContain('Emoji')
  })
})

interface Item {
  id: string
  uploader_id: string
  name: string
}

const manager = (over: Partial<ExpressionManagerProps<Item>> = {}): string =>
  renderToStaticMarkup(
    <ExpressionManager<Item>
      kind="emoji"
      items={[
        { id: 'e1', uploader_id: 'ana', name: 'festa' },
        { id: 'e2', uploader_id: 'bia', name: 'kkk' }
      ]}
      status="ready"
      onRetry={noop}
      canAdd
      canManage={(item) => item.uploader_id === 'ana'}
      preview={(item) => <i>{item.id}</i>}
      meta={() => undefined}
      save={noop}
      remove={noop}
      upload={() => <div>modal</div>}
      {...over}
    />
  )

describe('gestão de um tipo de expressão', () => {
  it('lista com o nome do emoji entre dois-pontos e ações só no que a pessoa pode', () => {
    const html = manager()
    expect(html).toContain(':festa:')
    expect(html).toContain(':kkk:')
    expect(html.match(/aria-label="Editar emoji"/g)).toHaveLength(1)
    expect(html).toContain('2 de 50 emojis')
    expect(html).not.toContain('modal')
  })

  it('sem itens, o texto de vazio', () => {
    expect(manager({ items: [] })).toContain(EXPRESSION_TEXTS.emoji.empty)
  })
})

describe('prévia do som', () => {
  it('o emoji do som ou o ícone da mesa de áudio', () => {
    expect(renderToStaticMarkup(<SoundThumb emoji="x" />)).toContain('x')
    expect(renderToStaticMarkup(<SoundThumb emoji={null} />)).toContain('<svg')
  })
})
