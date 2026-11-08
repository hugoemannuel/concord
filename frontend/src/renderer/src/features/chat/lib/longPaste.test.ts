import { describe, expect, it } from 'vitest'
import { longPasteFile, pastedFiles } from './longPaste'

const clipboard = (text: string, files: File[] = []): Pick<DataTransfer, 'getData'> & { files: ArrayLike<File> } => ({
  getData: (type: string) => (type === 'text/plain' ? text : ''),
  files
})

describe('texto longo colado vira message.txt', () => {
  it('acima de 2000 caracteres vira um anexo message.txt com o texto inteiro', async () => {
    const text = 'a'.repeat(3000)
    const file = longPasteFile(text, 0)
    expect(file?.name).toBe('message.txt')
    expect(file?.type).toBe('text/plain')
    expect(await file?.text()).toBe(text)
  })

  it('até 2000 caracteres cola normal', () => {
    expect(longPasteFile('a'.repeat(2000), 0)).toBeNull()
  })

  it('rascunho já com 10 anexos (ou sem permissão de anexar) cola normal', () => {
    expect(longPasteFile('a'.repeat(3000), 10)).toBeNull()
    expect(longPasteFile('a'.repeat(3000), null)).toBeNull()
  })

  it('pastedFiles: texto longo primeiro; senão os arquivos colados (print); texto curto, nada', () => {
    const print = new File(['x'], 'print.png', { type: 'image/png' })
    expect(pastedFiles(clipboard('a'.repeat(2001)), 0).map((f) => f.name)).toEqual(['message.txt'])
    expect(pastedFiles(clipboard('', [print]), 0)).toEqual([print])
    expect(pastedFiles(clipboard('oi'), 0)).toEqual([])
  })
})
