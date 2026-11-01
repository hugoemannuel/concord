import { PRIVACY_URL, TERMS_URL } from '../lib/legalLinks'

const LINK = 'font-medium text-brand hover:underline focus-ring rounded'

/** Link que abre fora do app (no Electron, o main entrega ao navegador). */
export function ExternalLink({
  href,
  children
}: {
  href: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <a href={href} target="_blank" rel="noreferrer noopener" className={LINK}>
      {children}
    </a>
  )
}

/** Cadastro: o aceite dos termos e da política, com os links. */
export function SignupConsent(): React.JSX.Element {
  return (
    <p className="text-ds-xs text-muted">
      Ao criar a conta você concorda com os{' '}
      <ExternalLink href={TERMS_URL}>Termos de uso</ExternalLink> e a{' '}
      <ExternalLink href={PRIVACY_URL}>Política de privacidade</ExternalLink>.
    </p>
  )
}

/** "Termos de uso · Política de privacidade" em texto pequeno (rodapés). */
export function LegalFooter({ className = '' }: { className?: string }): React.JSX.Element {
  return (
    <p className={`text-ds-xs text-muted ${className}`}>
      <ExternalLink href={TERMS_URL}>Termos de uso</ExternalLink>
      {' · '}
      <ExternalLink href={PRIVACY_URL}>Política de privacidade</ExternalLink>
    </p>
  )
}

/** Configurações → Privacidade e segurança: onde ler a política inteira. */
export function PrivacyPolicyNote(): React.JSX.Element {
  return (
    <section className="border-b border-subtle pb-6">
      <h2 className="mb-3 text-ds-sm font-medium text-muted">Política de privacidade</h2>
      <p className="text-ds-md text-secondary">
        O que guardamos, por quanto tempo, com quem compartilhamos e como excluir a sua conta estão
        na <ExternalLink href={PRIVACY_URL}>Política de privacidade</ExternalLink> e nos{' '}
        <ExternalLink href={TERMS_URL}>Termos de uso</ExternalLink>.
      </p>
    </section>
  )
}
