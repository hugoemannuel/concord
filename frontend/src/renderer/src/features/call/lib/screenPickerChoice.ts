/**
 * A fonte que o seletor marca e compartilha: a escolhida, se está na aba à vista;
 * senão a primeira da aba. Assim nunca vai ao ar algo que não está marcado na tela.
 */
export function pickerChoice(visible: { id: string }[], selected: string | null): string | null {
  if (visible.some((source) => source.id === selected)) return selected
  return visible[0]?.id ?? null
}
