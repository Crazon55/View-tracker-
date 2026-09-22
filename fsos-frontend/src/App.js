import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { DemoProvider } from "@/domain/store";
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
import Tickets from "@/pages/Tickets";
import SixDayTracker from "@/pages/SixDayTracker";
import Growth from "@/pages/Growth";
import UsersRoles from "@/pages/UsersRoles";
import { Toaster } from "@/components/ui/sonner";

function App() {
  return (
    <DemoProvider>
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
              <Route path="/tickets" element={<Tickets />} />
              <Route path="/six-day-tracker" element={<SixDayTracker />} />
              <Route path="/growth" element={<Growth />} />
              <Route path="/users-roles" element={<UsersRoles />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/help" element={<Help />} />
            </Route>
          </Routes>
        </UIProvider>
      </BrowserRouter>
      <Toaster position="bottom-center" richColors />
    </DemoProvider>
  );
}

export default App;
