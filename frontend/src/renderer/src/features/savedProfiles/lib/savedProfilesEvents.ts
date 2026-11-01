/** O que o tratamento dos eventos aciona (injetado: o teste não sobe o store). */
export interface SavedProfilesEventDeps {
  /** Recarrega a lista de perfis salvos, se ela já estiver aberta. */
  refresh: () => void
}

/**
 * saved_profiles:changed do WebSocket (sala user:<id>): outro aparelho da
 * mesma pessoa salvou, aplicou, renomeou, atualizou ou excluiu um perfil.
 */
export function handleSavedProfilesEvent(
  event: { type: string; payload: unknown },
  deps: SavedProfilesEventDeps
): void {
  if (event.type === 'saved_profiles:changed') deps.refresh()
}
