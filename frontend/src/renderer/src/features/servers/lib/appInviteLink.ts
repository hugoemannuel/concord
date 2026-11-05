import { IS_WEB } from '../../../shared/lib/config'
import { inviteLink } from './inviteLink'

/** No app web o link usa a própria origem (servidor próprio, sslip.io...). */
export function appInviteLink(code: string): string {
  return IS_WEB ? inviteLink(code, location.origin) : inviteLink(code)
}

/**
 * Origens que valem como "nossas" além dos domínios fixos: no navegador, a
 * própria origem do app; no desktop, o servidor embutido no build (PUBLIC_URL).
 */
export function serverOrigins(): (string | undefined)[] {
  return [IS_WEB ? location.origin : import.meta.env.VITE_SERVER_URL]
}
