import type { ExpressionOrigin } from '../api/expressions'

/** O texto de origem. Servidor privado, para quem não é membro, não tem nome. */
export function originText(origin: ExpressionOrigin | undefined): string {
  if (origin?.private) return 'de um servidor privado'
  return origin?.server_name ? `de ${origin.server_name}` : 'de outro servidor'
}
