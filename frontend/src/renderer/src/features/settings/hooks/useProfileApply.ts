import { useAuthStore } from '../../auth/store/authStore'
import { commitMe } from '../../auth/store/accountActions'
import { showToast } from '../../../shared/store/toastStore'
import { deleteProfileImage, updateProfile, uploadProfileImage } from '../../profile/api/users'
import { applyProfileChange } from '../lib/profileApply'
import { useProfileEditing, type ProfileApply } from './useProfileEditing'

export type { Cropping, ProfileApply } from './useProfileEditing'

/** Configurações → Perfis no perfil global: cada mudança vai para a conta. */
export function useProfileApply(): ProfileApply {
  const user = useAuthStore((s) => s.user)
  return useProfileEditing(user, (change, setProgress) =>
    applyProfileChange(
      change,
      {
        savedUser: () => useAuthStore.getState().user,
        upload: uploadProfileImage,
        remove: deleteProfileImage,
        update: updateProfile,
        commit: commitMe,
        setProgress
      },
      showToast
    )
  )
}
