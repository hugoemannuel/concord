import { describe, expect, it } from 'vitest'
import { parseMinimizedWindows, pickerSources, type PickerSource } from './minimizedWindows'

const source = (id: string, name: string, displayId = ''): PickerSource => ({
  id,
  name,
  thumbnail: 'data:image/png;base64,x',
  appIcon: null,
  displayId
})

describe('parseMinimizedWindows', () => {
  it('lê hwnd e título, aceitando CRLF e ignorando o que não é janela', () => {
    expect(parseMinimizedWindows('13829750\tVALORANT  \r\n\r\nlixo\n7\t\n42\tJogo\tcom tab\n')).toEqual([
      { hwnd: '13829750', title: 'VALORANT' },
      { hwnd: '42', title: 'Jogo\tcom tab' }
    ])
  })
})

describe('pickerSources', () => {
  const screen = source('screen:0:0', 'Screen 1', '1')

  it('oferece a janela minimizada, sem miniatura, depois das outras', () => {
    const browser = source('window:2:0', 'Navegador')
    expect(pickerSources([screen, browser], [{ hwnd: '9', title: 'VALORANT' }])).toEqual([
      screen,
      browser,
      { id: 'window:9:0', name: 'VALORANT', thumbnail: '', appIcon: null, displayId: '' }
    ])
  })

  it('janela que já está na lista não aparece duas vezes', () => {
    const game = source('window:9:0', 'VALORANT')
    expect(pickerSources([game], [{ hwnd: '9', title: 'VALORANT' }])).toEqual([game])
  })

  // Regressão: janela interna do jogo vinha marcada por padrão, no lugar do jogo.
  it('tira a janela interna do Direct3D', () => {
    const proxy = source('window:5:0', 'D3DProxyWindow')
    const game = source('window:9:0', 'VALORANT')
    expect(pickerSources([proxy, game], [])).toEqual([game])
  })
})
