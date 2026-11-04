import Button from '../../../shared/ui/Button'

/** Carregando, erro ou lista vazia das arquivadas (nada quando há cards). */
function ArchivedStatus({
  error,
  loading,
  empty,
  query,
  onRetry
}: {
  error: boolean
  loading: boolean
  /** Já carregou e não veio nenhum card. */
  empty: boolean
  query: string
  onRetry: () => void
}): React.JSX.Element | null {
  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <p className="text-ds-sm text-muted">Não foi possível carregar as arquivadas.</p>
        <Button variant="ghost" onClick={onRetry}>
          Tentar de novo
        </Button>
      </div>
    )
  }
  if (loading) return <p className="py-10 text-center text-ds-sm text-muted">Carregando…</p>
  if (!empty) return null
  return (
    <p className="py-10 text-center text-ds-sm text-muted">
      {query ? `Nada encontrado para “${query}”.` : 'Nenhuma proposta arquivada ainda.'}
    </p>
  )
}

export default ArchivedStatus
