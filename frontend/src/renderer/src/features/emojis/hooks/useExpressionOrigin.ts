import { useEffect } from 'react'
import type { ResolvedExpression } from '../api/expressions'
import { requestOrigin, useExpressionOrigins, type OriginKind } from '../store/expressionOrigins'

/** O que se sabe do item de outro servidor (undefined até responder; ver o store). */
export function useExpressionOrigin(
  kind: OriginKind,
  id: string,
  enabled: boolean
): ResolvedExpression | null | undefined {
  const entry = useExpressionOrigins((s) => s[kind][id])
  useEffect(() => {
    if (enabled) requestOrigin(kind, id)
  }, [kind, id, enabled])
  return entry
}
