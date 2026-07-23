import { useAuth } from "@/contexts/AuthContext";

/** Shown when a user has joined but Admin has not assigned a real role yet. */
export default function RoleSelect() {
  const { user, signOut } = useAuth();
  const firstName =
    user?.user_metadata?.full_name?.split(" ")[0] ||
    user?.email?.split("@")[0] ||
    "";

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-5">
        <h1 className="text-3xl font-black text-white">Welcome, {firstName}</h1>
        <p className="text-zinc-400 text-sm leading-relaxed">
          Your account is <span className="text-amber-400/90 font-medium">pending access</span>.
          An admin will assign your role (for example HOOC-BD, AY-BD, OWLED CORE-BD, or SNOBALL-BD)
          before you can use Frontseat OS.
        </p>
        <p className="text-xs text-zinc-600">
          Signed in as {user?.email}. Refresh after your admin grants access.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm rounded-lg font-semibold"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={() => signOut()}
            className="px-4 py-2.5 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300 text-sm rounded-lg"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
