import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { WorkspaceProvider, useWorkspace } from "@/domain/store";
import { initSession, getToken, redirectError } from "@/lib/session";
import { setTokenSource } from "@/lib/api";
import SignIn from "@/components/auth/SignIn";
import { Loading, PendingAccess, LoadFailed } from "@/components/auth/Gate";
import { UIProvider } from "@/components/idea/IdeaModalProvider";
import AppShell from "@/components/shell/AppShell";
import CommandRoom from "@/pages/CommandRoom";
import BOStudio from "@/pages/BOStudio";
import HPNDesk from "@/pages/HPNDesk";
import Production from "@/pages/Production";
import Distribution from "@/pages/Distribution";
import Performance from "@/pages/Performance";
import Settings from "@/pages/Settings";
import Help from "@/pages/Help";
import NewsFeed from "@/pages/NewsFeed";
import SixDayTracker from "@/pages/SixDayTracker";
import Growth from "@/pages/Growth";
import UsersRoles from "@/pages/UsersRoles";
import { Toaster } from "@/components/ui/sonner";

// Adopt any session in the URL or storage before the first render, and let the API
// layer ask for the token. Both run once, at module load, so no request goes out
// unauthenticated and then has to be retried.
initSession();
setTokenSource(getToken);
const SIGN_IN_ERROR = redirectError();

/** Nothing renders until we know who you are and what you may see. */
function Workspace({ children }) {
  const { status, error, reload, identity } = useWorkspace();
  if (status === "signed_out") return <SignIn error={SIGN_IN_ERROR} />;
  if (status === "loading") return <Loading />;
  if (status === "pending") return <PendingAccess email={identity?.email} />;
  if (status === "error") return <LoadFailed error={error} onRetry={reload} />;
  return children;
}

function App() {
  return (
    <WorkspaceProvider>
      <Workspace>
      <BrowserRouter>
        <UIProvider>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/" element={<CommandRoom />} />
              <Route path="/bo" element={<BOStudio />} />
              <Route path="/hpn" element={<HPNDesk />} />
              <Route path="/production" element={<Production />} />
              <Route path="/distribution" element={<Distribution />} />
              <Route path="/performance" element={<Performance />} />
              <Route path="/news" element={<NewsFeed />} />
              <Route path="/six-day-tracker" element={<SixDayTracker />} />
              <Route path="/growth" element={<Growth />} />
              <Route path="/users-roles" element={<UsersRoles />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/help" element={<Help />} />
            </Route>
          </Routes>
        </UIProvider>
      </BrowserRouter>
      </Workspace>
      <Toaster position="bottom-center" richColors />
    </WorkspaceProvider>
  );
}

export default App;
