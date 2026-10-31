import type { User } from '../../../../auth/store/authStore'
import Avatar from '../../../../../shared/ui/Avatar'
import Nameplate from '../../../../profile/components/Nameplate'
import StyledName from '../../../../profile/components/StyledName'
import { previewRows } from '../../../lib/cosmeticsEditor'

const FADE = 'var(--bg-members)'

/** Uma linha de membro como os outros veem, parada ou animando. */
function PreviewRow({ user, animate }: { user: User; animate: boolean }): React.JSX.Element {
  const name = user.display_name || user.username
  return (
    <div className="relative flex min-h-11 items-center gap-3 rounded-lg bg-[var(--bg-members)] px-2 py-1">
      <Nameplate url={user.nameplate_url} active={false} fade={FADE} forceAnimate={animate} />
      <Avatar
        name={name}
        avatarUrl={user.avatar_url}
        decorationUrl={user.avatar_decoration_url}
        animate={animate ? 'always' : 'never'}
        size={32}
        cutoutColor={FADE}
      />
      <span className="relative min-w-0 truncate text-ds-md font-medium text-normal">
        <StyledName name={name} style={user.name_style} />
      </span>
    </div>
  )
}

/**
 * A prévia da faixa e da moldura: "Parada" (como fica na lista) e, se algo é
 * GIF, "Animando" (como fica no hover). Lado a lado a partir de 480 px.
 */
export default function NameplatePreview({ user }: { user: User }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3 min-[480px]:flex-row">
      {previewRows(user).map((row) => (
        <figure key={row.label} className="flex min-w-0 flex-1 flex-col gap-1">
          <figcaption className="text-ds-xs font-semibold uppercase text-muted">
            {row.label}
          </figcaption>
          <PreviewRow user={user} animate={row.animate} />
        </figure>
      ))}
    </div>
  )
}
