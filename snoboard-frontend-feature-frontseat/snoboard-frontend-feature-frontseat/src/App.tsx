import { useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, NavLink, useLocation, useNavigate } from "react-router-dom";
import { FileText, Film, Radio, Users, LayoutDashboard, Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

import Dashboard from "./pages/Dashboard";
import PageDetail from "./pages/PageDetail";
import PagesView from "./pages/PagesView";
import PostsView from "./pages/PostsView";
import ReelsStage1View from "./pages/ReelsStage1View";
import ReelsMainView from "./pages/ReelsMainView";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/posts", label: "Posts", icon: FileText },
  { to: "/reels/stage1", label: "Reels Stage 1", icon: Film },
  { to: "/reels/main", label: "Reels Main IPs", icon: Radio },
  { to: "/pages", label: "Pages", icon: Users },
];

function HamburgerMenu() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <div className="fixed top-5 left-5 z-50">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-xl bg-zinc-900/80 border border-zinc-800 backdrop-blur-sm hover:bg-zinc-800 hover:border-violet-500/50"
          >
            <Menu className="w-5 h-5 text-white" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 bg-zinc-950 border-zinc-800 p-0">
          <div className="px-5 py-6 border-b border-zinc-800">
            <h1 className="text-lg font-bold text-white tracking-tight">View Tracker</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Instagram Analytics</p>
          </div>
          <nav className="px-3 py-4 space-y-1">
            {navItems.map(({ to, label, icon: Icon }) => (
              <button
                key={to}
                onClick={() => { navigate(to); setOpen(false); }}
                className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors w-full text-left text-zinc-400 hover:text-white hover:bg-zinc-900"
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </nav>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function AppLayout() {
  const location = useLocation();

  const isFullScreen =
    location.pathname === "/" ||
    location.pathname.startsWith("/page/");

  if (isFullScreen) {
    return (
      <>
        <HamburgerMenu />
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/page/:pageId" element={<PageDetail />} />
        </Routes>
      </>
    );
  }

  return (
    <div className="flex min-h-screen bg-zinc-950">
      {/* Sidebar */}
      <aside className="w-60 shrink-0 border-r border-zinc-800 bg-zinc-950 flex flex-col">
        <div className="px-5 py-5 border-b border-zinc-800">
          <h1 className="text-lg font-bold tracking-tight text-white">
            View Tracker
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">Instagram Analytics</p>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-violet-500/10 text-violet-400"
                    : "text-zinc-500 hover:text-white hover:bg-zinc-900"
                }`
              }
            >
              <Icon className="w-4 h-4" />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto bg-zinc-950">
        <Routes>
          <Route path="/pages" element={<PagesView />} />
          <Route path="/posts" element={<PostsView />} />
          <Route path="/reels/stage1" element={<ReelsStage1View />} />
          <Route path="/reels/main" element={<ReelsMainView />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </div>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AppLayout />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
