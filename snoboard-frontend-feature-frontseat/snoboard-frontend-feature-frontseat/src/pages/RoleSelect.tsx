import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";

export default function RoleSelect() {
  const { user, setRole, ROLES } = useAuth();
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const firstName = user?.user_metadata?.full_name?.split(" ")[0] || user?.email?.split("@")[0] || "";

  const handleConfirm = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await setRole(selected);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-black text-white mb-2">Welcome, {firstName}</h1>
          <p className="text-zinc-500 text-sm">Select your role in the company to get started</p>
        </div>

        <div className="space-y-2">
          {ROLES.map((role) => (
            <button
              key={role.value}
              onClick={() => setSelected(role.value)}
              className={`w-full text-left px-5 py-4 rounded-xl border transition-all ${
                selected === role.value
                  ? "bg-violet-600/10 border-violet-500/50 text-white"
                  : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-white"
              }`}
            >
              <span className="text-sm font-semibold">{role.label}</span>
            </button>
          ))}
        </div>

        <button
          onClick={handleConfirm}
          disabled={!selected || saving}
          className={`w-full mt-6 py-3 rounded-xl text-sm font-bold transition-all ${
            selected
              ? "bg-violet-600 hover:bg-violet-700 text-white"
              : "bg-zinc-800 text-zinc-600 cursor-not-allowed"
          }`}
        >
          {saving ? "Saving..." : "Continue"}
        </button>
      </div>
    </div>
  );
}
