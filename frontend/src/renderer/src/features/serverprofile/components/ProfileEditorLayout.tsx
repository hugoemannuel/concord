import type { ReactNode } from 'react'
import Button from '../../../shared/ui/Button'
import SectionHeader from '../../../shared/ui/SectionHeader'
import Spinner from '../../../shared/ui/Spinner'

/** Um campo do editor: título, explicação e o controle. */
export function EditorField({
  title,
  hint,
  children
}: {
  /** Sem título: o próprio controle já traz o dele. */
  title?: string
  hint?: string
  children: ReactNode
}): React.JSX.Element {
  return (
    <section className="border-b border-subtle pb-6 last:border-b-0 last:pb-0">
      {title && <h3 className="mb-3 text-ds-md font-semibold text-strong">{title}</h3>}
      {hint && <p className="-mt-2.5 mb-3 text-ds-sm text-muted">{hint}</p>}
      {children}
    </section>
  )
}

export function EditorLoading(): React.JSX.Element {
  return (
    <div className="flex h-48 items-center justify-center" role="status" aria-label="Carregando">
      <Spinner className="h-6 w-6" />
    </div>
  )
}

/** "Você tem alterações não salvas" com Redefinir e Salvar, preso ao pé da tela. */
export function UnsavedBar({
  saving,
  canSave = true,
  onReset,
  onSave
}: {
  saving: boolean
  canSave?: boolean
  onReset: () => void
  onSave: () => void
}): React.JSX.Element {
  return (
    <div
      role="status"
      className="sticky bottom-4 z-20 mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-subtle bg-floating px-4 py-3 shadow-2xl backdrop-blur-xl"
    >
      <p className="min-w-0 text-ds-sm font-medium text-strong">Você tem alterações não salvas</p>
      <div className="flex shrink-0 gap-2">
        <Button variant="ghost" size="sm" onClick={onReset} disabled={saving}>
          Redefinir
        </Button>
        <Button variant="success" size="sm" onClick={onSave} loading={saving} disabled={!canSave}>
          Salvar
        </Button>
      </div>
    </div>
  )
}

/**
 * O formulário à esquerda e a prévia ao lado; em tela estreita a prévia vem em
 * cima, para continuar à vista de quem edita.
 */
export default function ProfileEditorLayout({
  preview,
  previewLabel = 'Prévia',
  children,
  bar
}: {
  preview: ReactNode
  previewLabel?: string
  children: ReactNode
  bar: ReactNode
}): React.JSX.Element {
  return (
    <div className="flex min-w-0 flex-col">
      <div className="flex min-w-0 flex-col gap-6 lg:flex-row-reverse lg:items-start">
        <aside className="w-full min-w-0 lg:sticky lg:top-0 lg:w-72 lg:shrink-0">
          <SectionHeader as="p" className="mb-2">
            {previewLabel}
          </SectionHeader>
          {preview}
        </aside>
        <div className="flex min-w-0 flex-1 flex-col gap-6">{children}</div>
      </div>
      {bar}
    </div>
  )
}
