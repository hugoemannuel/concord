import type { User } from '../../../../auth/store/authStore'
import ProfileCardFrame from '../../../../profile/components/ProfileCardFrame'
import StyledName from '../../../../profile/components/StyledName'
import { SPOT_PLACEHOLDER } from '../../../../profile/lib/cardSpots'
import { profileThemeLook } from '../../../../profile/lib/profileTheme'
import { draftFromProfile } from '../../../../profile/lib/profileValidation'
import {
  linksSummary,
  nameStyleSummary,
  soundSummary,
  textSummary,
  themeName
} from '../../../lib/profileTiles'
import type { ProfileImageKind as ImageKind } from '../../../../profile/api/users'
import type { ProfileModalId } from '../modals/ProfileEditModal'
import { DEFAULT_BANNER } from '../../../../profile/lib/profileMedia'
import StatusIcon from '../../../../../shared/ui/StatusIcon'
import { STATUS_META, type PresenceStatus } from '../../../../friends/lib/presenceStatus'
import MediaTiles from './MediaTiles'
import { Tile, TileRow, TileSection } from './Tile'

type Open = (modal: ProfileModalId) => void

/** Cor do banner: a barra com a cor (ou o degradê padrão) e o código dela. */
function BannerColorTile({ color, onOpen }: { color: string | null; onOpen: Open }): React.JSX.Element {
  return (
    <TileSection title="Cor do banner">
      <Tile label="Mudar a cor do banner" onClick={() => onOpen('banner_color')} className="h-11 w-full px-3">
        <span aria-hidden="true" className="absolute inset-0" style={{ background: color ?? DEFAULT_BANNER }} />
        <span className="relative rounded-md bg-black/45 px-1.5 py-0.5 font-mono text-ds-xs text-white">
          {color ?? 'Padrão'}
        </span>
      </Tile>
    </TileSection>
  )
}

/** Tema do perfil: a miniatura da moldura e o nome da predefinição. */
function ThemeTile({ user, onOpen }: { user: User; onOpen: Open }): React.JSX.Element {
  const theme = draftFromProfile(user).profile_theme
  const banner = user.banner_color ?? DEFAULT_BANNER
  return (
    <TileSection title="Tema do perfil">
      <Tile label="Mudar o tema do perfil" onClick={() => onOpen('theme')} className="w-full gap-3 p-2 pr-9">
        <ProfileCardFrame
          look={profileThemeLook(theme)}
          aria-hidden="true"
          className="relative h-12 w-16 shrink-0 overflow-hidden"
        >
          {/* Um cartão em miniatura: o banner e o avatar por cima da moldura. */}
          <span className="block h-4" style={{ background: banner }} />
          <span className="absolute left-1.5 top-2 size-4 rounded-full border-2 border-[var(--bg-floating)] bg-[var(--text-muted)]" />
        </ProfileCardFrame>
        <span className="min-w-0 truncate text-ds-sm font-medium text-strong">{themeName(theme)}</span>
      </Tile>
    </TileSection>
  )
}

/** Estilo do nome: o nome já estilizado e "Fonte · Efeito". */
function NameTile({ user, onOpen }: { user: User; onOpen: Open }): React.JSX.Element {
  const { display_name, name_style } = draftFromProfile(user)
  return (
    <TileSection title="Nome de exibição">
      <Tile
        label="Editar nome de exibição e estilo"
        onClick={() => onOpen('name')}
        className="w-full flex-col items-start gap-0.5 px-3 py-2.5 pr-9"
      >
        <span className="w-full min-w-0 truncate text-ds-lg font-bold text-strong">
          <StyledName name={display_name || user.username} style={name_style} />
        </span>
        <span className="text-ds-xs text-muted">{nameStyleSummary(name_style)}</span>
      </Tile>
    </TileSection>
  )
}

/** Status de presença: o ícone e o nome do status atual. */
function StatusTile({ user, onOpen }: { user: User; onOpen: Open }): React.JSX.Element {
  const currentStatus = (user.status as PresenceStatus) ?? 'online'
  const meta = STATUS_META[currentStatus] ?? STATUS_META.online
  return (
    <TileSection title="Status">
      <Tile
        label="Mudar status de presença"
        onClick={() => onOpen('status')}
        className="w-full gap-2 px-3 py-2.5 pr-9"
      >
        <StatusIcon status={currentStatus} size={12} />
        <span className="min-w-0 truncate text-ds-sm font-medium text-strong">{meta.label}</span>
      </Tile>
    </TileSection>
  )
}

/** Pronomes, nota, Sobre mim e links: o valor atual ou o convite. */
function TextTiles({ user, onOpen }: { user: User; onOpen: Open }): React.JSX.Element {
  const draft = draftFromProfile(user)
  return (
    <>
      <TileSection title="Pronomes">
        <TileRow
          label="Editar pronomes"
          value={textSummary(draft.pronouns)}
          empty={SPOT_PLACEHOLDER.pronouns}
          onClick={() => onOpen('pronouns')}
        />
      </TileSection>
      <TileSection title="Nota">
        <TileRow
          label="Editar nota"
          value={textSummary(draft.status_text)}
          empty={SPOT_PLACEHOLDER.note}
          onClick={() => onOpen('note')}
        />
      </TileSection>
      <TileSection title="Sobre mim">
        <TileRow
          label="Editar sobre mim"
          value={textSummary(draft.bio)}
          empty={SPOT_PLACEHOLDER.bio}
          onClick={() => onOpen('bio')}
        />
      </TileSection>
      <TileSection title="Links">
        <TileRow
          label="Editar links"
          value={linksSummary(draft.links)}
          empty={SPOT_PLACEHOLDER.links}
          onClick={() => onOpen('links')}
        />
      </TileSection>
    </>
  )
}

/**
 * A coluna de personalização de Configurações → Perfis, como no Discord:
 * blocos compactos, cada um abre o editor dele (modal com prévia e
 * "Aplicar", que já salva). No celular vira uma grade embaixo do cartão.
 */
export default function ProfileTiles({
  user,
  avatarUrl,
  bannerUrl,
  busy,
  onPick,
  onRemove,
  onOpen
}: {
  user: User
  avatarUrl: string | null
  bannerUrl: string | null
  /** Uma mudança está indo para o servidor: as imagens esperam. */
  busy: boolean
  onPick: (kind: ImageKind) => void
  onRemove: (kind: ImageKind) => void
  onOpen: Open
}): React.JSX.Element {
  return (
    <div
      role="group"
      aria-label="Personalizar perfil"
      className="grid min-w-0 content-start gap-x-4 gap-y-5 sm:grid-cols-2 lg:grid-cols-1"
    >
      <MediaTiles
        name={user.display_name || user.username}
        avatarUrl={avatarUrl}
        bannerUrl={bannerUrl}
        bannerColor={user.banner_color ?? null}
        busy={busy}
        onPick={onPick}
        onRemove={onRemove}
      />
      <BannerColorTile color={user.banner_color ?? null} onOpen={onOpen} />
      <ThemeTile user={user} onOpen={onOpen} />
      <NameTile user={user} onOpen={onOpen} />
      <StatusTile user={user} onOpen={onOpen} />
      <TextTiles user={user} onOpen={onOpen} />
      <TileSection title="Som de entrada">
        <TileRow
          label="Mudar o som de entrada"
          value={soundSummary(user.entrance_sound_url ?? null)}
          empty=""
          onClick={() => onOpen('sound')}
        />
      </TileSection>
    </div>
  )
}
