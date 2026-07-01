import { Eye, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function RolePreviewBanner() {
  const {
    isRolePreviewActive,
    roleName,
    actualRoleName,
    canUseRolePreview,
    ROLES,
    setRolePreview,
    clearRolePreview,
    rolePreview,
  } = useAuth();

  if (!canUseRolePreview || !isRolePreviewActive) return null;

  return (
    <div className="fixed top-0 inset-x-0 z-[70] flex items-center justify-center gap-3 border-b border-amber-500/40 bg-amber-950/95 px-4 py-2 backdrop-blur-sm">
      <Eye className="h-4 w-4 shrink-0 text-amber-300" />
      <p className="text-sm text-amber-100">
        Previewing as <span className="font-semibold text-white">{roleName}</span>
        {actualRoleName ? (
          <span className="text-amber-200/70"> · signed in as {actualRoleName}</span>
        ) : null}
      </p>
      <Select value={rolePreview ?? undefined} onValueChange={setRolePreview}>
        <SelectTrigger className="h-8 w-[220px] border-amber-500/30 bg-amber-900/40 text-xs text-amber-50">
          <SelectValue placeholder="Switch role" />
        </SelectTrigger>
        <SelectContent className="bg-zinc-950 border-zinc-800">
          {ROLES.map(({ value, label }) => (
            <SelectItem key={value} value={value} className="text-sm">
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={clearRolePreview}
        className="h-8 gap-1.5 text-amber-100 hover:bg-amber-500/20 hover:text-white"
      >
        <X className="h-3.5 w-3.5" />
        Exit preview
      </Button>
    </div>
  );
}
