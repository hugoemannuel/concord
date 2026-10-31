import { beforeEach, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import ScreenStatsCorner, { ScreenStatsCard, StatsCorner } from './ScreenStatsPanel'
import { useScreenStatsStore } from '../store/screenStatsStore'

const bia = { userId: 'bia', local: false }

describe('ScreenStatsCorner', () => {
  beforeEach(() => useScreenStatsStore.getState().close())

  it('fechado: só o ícone (sem painel e sem coleta)', () => {
    const html = renderToStaticMarkup(<ScreenStatsCorner owner={bia} />)
    expect(html).toContain('aria-expanded="false"')
    expect(html).not.toContain('role="dialog"')
  })

  it('aberto: mostra o painel medindo', () => {
    const html = renderToStaticMarkup(
      <StatsCorner owner={bia} open onToggle={() => {}} onClose={() => {}} />
    )
    expect(html).toContain('aria-expanded="true"')
    expect(html).toContain('role="dialog"')
    expect(html).toContain('Medindo…')
    expect(html).toContain('Recebendo')
  })
})

describe('ScreenStatsCard', () => {
  it('linhas, aviso de pausa e botão de fechar; cabe em 360 px', () => {
    const html = renderToStaticMarkup(
      <ScreenStatsCard
        local={false}
        onClose={() => {}}
        view={{
          rows: [{ label: 'Codec', value: 'H264' }],
          status: 'Vídeo pausado (fora de vista)'
        }}
      />
    )
    expect(html).toContain('H264')
    expect(html).toContain('Vídeo pausado (fora de vista)')
    expect(html).toContain('aria-label="Fechar estatísticas"')
    expect(html).toContain('max-w-[calc(100%-1rem)]')
  })

  it('nota do driver no pé do painel, quebrando linha (não corta em 360 px)', () => {
    const html = renderToStaticMarkup(
      <ScreenStatsCard
        local={false}
        onClose={() => {}}
        view={{
          rows: [{ label: 'Decodificador', value: 'Software · FFmpeg' }],
          status: null,
          note: 'Instale o nvidia-vaapi-driver para usar a placa de vídeo'
        }}
      />
    )
    expect(html).toMatch(
      /<p class="[^"]*">Instale o nvidia-vaapi-driver para usar a placa de vídeo<\/p>/
    )
    expect(html).not.toMatch(/truncate[^>]*>Instale/)
  })

  it('minha transmissão', () => {
    const html = renderToStaticMarkup(
      <ScreenStatsCard local onClose={() => {}} view={{ rows: [], status: null }} />
    )
    expect(html).toContain('Sua transmissão')
    expect(html).not.toContain('<dl')
  })
})

describe('StatsCorner: visibilidade do ícone', () => {
  const render = (open: boolean): string =>
    renderToStaticMarkup(<StatsCorner owner={bia} open={open} onToggle={() => {}} onClose={() => {}} />)

  it('fechado: só aparece com o mouse no tile', () => {
    expect(render(false)).toContain('group-hover/tile:opacity-100')
  })

  it('aberto: fica sempre visível junto do painel', () => {
    const html = render(true)
    const button = html.slice(html.indexOf('<button'), html.indexOf('>', html.indexOf('<button')))
    expect(button).not.toContain('opacity-0')
  })
})
