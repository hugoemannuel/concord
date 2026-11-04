import { useAuthStore } from '../../../auth/store/authStore'
import { useProfileApply } from '../../hooks/useProfileApply'
import ProfileEditorBody from '../profile/ProfileEditorBody'
import SavedProfilesPanel from '../../../savedProfiles/components/SavedProfilesPanel'
import MyServerTagPicker from '../../../serverprofile/components/MyServerTagPicker'
import ProfileScopePicker from '../../../serverProfiles/components/ProfileScopePicker'
import ServerProfileEditor from '../../../serverProfiles/components/ServerProfileEditor'
import { useProfileEditorScopeStore } from '../../../serverProfiles/store/profileEditorScopeStore'
import { useServerStore } from '../../../servers/store/serverStore'

/** O perfil global: no topo, os perfis salvos para trocar o perfil inteiro de uma vez. */
function GlobalProfileEditor(): React.JSX.Element {
  const profile = useProfileApply()
  return (
    <>
      <SavedProfilesPanel />
      <ProfileEditorBody profile={profile} />
      <MyServerTagPicker />
    </>
  )
}

/**
 * Configurações → Perfis: o seletor "Perfil global / <servidor>" e o editor do
 * perfil escolhido. Sem nada num servidor, a pessoa aparece lá com o global.
 */
function ProfilesSection(): React.JSX.Element | null {
  const serverId = useProfileEditorScopeStore((s) => s.serverId)
  const server = useServerStore((s) => s.servers.find((x) => x.id === serverId))
  const signedIn = useAuthStore((s) => Boolean(s.user))
  if (!signedIn) return null
  return (
    <div className="flex min-w-0 flex-col gap-8">
      <ProfileScopePicker />
      {server ? (
        <ServerProfileEditor key={server.id} serverId={server.id} serverName={server.name} />
      ) : (
        <GlobalProfileEditor />
      )}
    </div>
  )
}

export default ProfilesSection
