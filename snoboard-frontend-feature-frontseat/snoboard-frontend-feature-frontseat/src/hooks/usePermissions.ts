import { useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { hasPermission, canEditIdea, canDeleteIdea } from '@/lib/permissions'
import type { Permission } from '@/lib/permissions'

export function usePermissions() {
  const {
    role,
    actualRole,
    user,
    isRolePreviewActive,
    canUseRolePreview,
    setRolePreview,
    clearRolePreview,
  } = useAuth()
  const userName =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email?.split('@')[0] ||
    ''

  // Stable refs — only re-create when role or userName changes
  const can = useCallback(
    (permission: Permission) => hasPermission(role, permission),
    [role]
  )

  const canEditThisIdea = useCallback(
    (idea: { created_by?: string | null; cs_owner_name?: string }) =>
      canEditIdea(role, idea.created_by ?? idea.cs_owner_name ?? '', userName),
    [role, userName]
  )

  const canDeleteThisIdea = useCallback(
    (idea: { created_by?: string | null; cs_owner_name?: string }) =>
      canDeleteIdea(role, idea.created_by ?? idea.cs_owner_name ?? '', userName),
    [role, userName]
  )

  return {
    can,
    canEditThisIdea,
    canDeleteThisIdea,
    role,
    actualRole,
    isRolePreviewActive,
    canUseRolePreview,
    setRolePreview,
    clearRolePreview,
    userName,
  }
}
