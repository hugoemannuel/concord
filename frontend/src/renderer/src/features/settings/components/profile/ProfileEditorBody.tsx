import { useRef, useState } from 'react'
import { PROFILE_IMAGE_TYPES } from '../../../profile/lib/profileValidation'
import ImageCropModal from '../ImageCropModal'
import type { ProfileImageKind as ImageKind } from '../../../profile/api/users'
import type { CosmeticsTarget } from '../../hooks/useCosmeticsEditor'
import type { ProfileApply } from '../../hooks/useProfileEditing'
import { spotOpensFile, type CardSpot } from '../../../profile/lib/cardSpots'
import { savingLabel } from '../../lib/profileTiles'
import ProfileStage from './ProfileStage'
import ProfileEditModal, { type ProfileModalId } from './modals/ProfileEditModal'
import ProfileTiles, { type MediaControls } from './tiles/ProfileTiles'
import ConfirmModal from '../../../friends/components/ConfirmModal'

const MEDIA_KINDS: ImageKind[] = ['avatar', 'banner']

/** Remover já salva: confirma antes (o Discord pede o mesmo). */
function RemoveMediaConfirm({
  kind,
  onConfirm,
  onClose
}: {
  kind: ImageKind | null
  onConfirm: (kind: ImageKind) => Promise<unknown>
  onClose: () => void
}): React.JSX.Element | null {
  if (!kind) return null
  return (
    <ConfirmModal
      open
      title={`Remover ${kind}?`}
      confirmLabel={`Remover ${kind}`}
      onConfirm={async () => {
        await onConfirm(kind)
      }}
      onClose={onClose}
    >
      {kind === 'avatar'
        ? 'Seu perfil volta a mostrar a inicial do seu nome.'
        : 'O banner volta a mostrar a cor escolhida (ou o degradê padrão).'}
    </ConfirmModal>
  )
}

type FileInputs = Record<ImageKind, React.RefObject<HTMLInputElement | null>>

function FileInputs({
  inputs,
  onPick
}: {
  inputs: FileInputs
  onPick: ProfileApply['pickFile']
}): React.JSX.Element {
  return (
    <>
      {MEDIA_KINDS.map((kind) => (
        <input
          key={kind}
          ref={inputs[kind]}
          type="file"
          accept={PROFILE_IMAGE_TYPES.join(',')}
          className="hidden"
          aria-label={kind === 'avatar' ? 'Arquivo do avatar' : 'Arquivo do banner'}
          onChange={(e) => {
            onPick(kind, e.target.files?.[0])
            e.target.value = ''
          }}
        />
      ))}
    </>
  )
}

function CropModal({ profile }: { profile: ProfileApply }): React.JSX.Element | null {
  const { cropping } = profile
  if (!cropping) return null
  return (
    <ImageCropModal
      file={cropping.file}
      src={cropping.src}
      kind={cropping.kind}
      onCancel={() => profile.closeCrop()}
      onApply={(change) => profile.closeCrop(change)}
    />
  )
}

/**
 * Os blocos e o cartão de Configurações → Perfis, como a tela "Perfis" do
 * Discord: à esquerda, a coluna estreita de personalização; à direita, o
 * cartão inteiro e grande como os outros veem. Bloco ou parte do cartão abrem o
 * editor (avatar e banner: o arquivo e o recorte; o resto: um modal com
 * prévia). Cada "Aplicar" já salva. Serve ao perfil global e ao de um servidor:
 * muda só `profile` (e os controles do modo servidor).
 */
export default function ProfileEditorBody({
  profile,
  cosmetics,
  nameLocked,
  mediaControls
}: {
  profile: ProfileApply
  /** Perfil de servidor: faixa e moldura salvam nele. */
  cosmetics?: CosmeticsTarget
  /** Sem permissão para mudar o nome aqui. */
  nameLocked?: boolean
  /** Perfil de servidor: "Voltar ao padrão" no lugar de "Remover". */
  mediaControls?: MediaControls
}): React.JSX.Element | null {
  const inputs: FileInputs = { avatar: useRef(null), banner: useRef(null) }
  const [modal, setModal] = useState<ProfileModalId | null>(null)
  const [removing, setRemoving] = useState<ImageKind | null>(null)
  const { user, avatarUrl, bannerUrl } = profile
  if (!user) return null

  const base = { user, avatarUrl, bannerUrl, nameLocked }
  const pick = (kind: ImageKind): void => inputs[kind].current?.click()
  const edit = (spot: CardSpot): void => (spotOpensFile(spot) ? pick(spot) : setModal(spot))

  return (
    <>
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[250px_minmax(0,1fr)] lg:items-start xl:grid-cols-[280px_minmax(0,1fr)] xl:gap-8">
        <ProfileStage
          base={base}
          status={savingLabel(profile.saving, profile.progress)}
          onEdit={edit}
        />
        <ProfileTiles
          user={user}
          avatarUrl={avatarUrl}
          bannerUrl={bannerUrl}
          busy={profile.saving}
          onPick={pick}
          onRemove={mediaControls ? mediaControls.onReset : setRemoving}
          onOpen={setModal}
          mediaControls={mediaControls}
        />
      </div>

      <FileInputs inputs={inputs} onPick={profile.pickFile} />
      <CropModal profile={profile} />
      <ProfileEditModal
        modal={modal}
        base={base}
        busy={profile.saving}
        cosmetics={cosmetics}
        onClose={() => setModal(null)}
        onApply={(fields) => profile.apply({ fields })}
      />
      <RemoveMediaConfirm
        kind={removing}
        onConfirm={(kind) => profile.apply({ [kind]: { kind: 'remove' } })}
        onClose={() => setRemoving(null)}
      />
    </>
  )
}
