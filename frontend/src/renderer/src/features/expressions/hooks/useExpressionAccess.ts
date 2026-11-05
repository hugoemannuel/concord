import { useAuthStore } from '../../auth/store/authStore'
import { useServerAccess } from '../../servers/hooks/useServerAccess'
import { canAddExpression, canManageExpression, type ExpressionKind } from '../lib/expressionRules'

export interface ExpressionAccess {
  canAdd: boolean
  /** Editar e apagar esse item. */
  canManage: (item: { uploader_id: string }) => boolean
}

/** O que a pessoa pode com esse tipo de expressão no servidor aberto. */
export function useExpressionAccess(kind: ExpressionKind): ExpressionAccess {
  const { perms } = useServerAccess()
  const meId = useAuthStore((s) => s.user?.id)
  return {
    canAdd: canAddExpression(kind, perms),
    canManage: (item) => canManageExpression(item, meId, perms)
  }
}
