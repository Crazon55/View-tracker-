import { useState, useEffect, useRef } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, NavLink, useLocation, useNavigate } from "react-router-dom";
import { FileText, Film, Users, LayoutDashboard, Menu, TrendingUp, Radio, Lightbulb, LogOut, Swords } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Login from "./pages/Login";
import ChatBubble from "./components/ChatBubble";

import Dashboard from "./pages/Dashboard";
import PageDetail from "./pages/PageDetail";
import PagesView from "./pages/PagesView";
import PostsView from "./pages/PostsView";
import ReelsStage1View from "./pages/ReelsStage1View";
import GrowthView from "./pages/GrowthView";
import MainReelsView from "./pages/MainReelsView";
import IdeaEngine from "./pages/IdeaEngine";
import CompetitorIdeas from "./pages/CompetitorIdeas";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

const NAME_OVERRIDES: Record<string, string> = {
  "krishna.koushik@owledmedia.com": "Koushik",
};

function getFirstName(user: { user_metadata?: { full_name?: string; name?: string }; email?: string } | null): string {
  const email = user?.email || "";
  if (NAME_OVERRIDES[email]) return NAME_OVERRIDES[email];
  const fullName = user?.user_metadata?.full_name || user?.user_metadata?.name || "";
  if (fullName) return fullName.split(" ")[0];
  return email.split("@")[0] || "";
}

const ANIMALS = [
  "\u{1F436}", "\u{1F431}", "\u{1F43B}", "\u{1F43C}", "\u{1F428}", "\u{1F437}",
  "\u{1F430}", "\u{1F98A}", "\u{1F981}", "\u{1F42F}", "\u{1F427}", "\u{1F438}",
  "\u{1F99C}", "\u{1F98E}", "\u{1F422}", "\u{1F98B}", "\u{1F41D}", "\u{1F433}",
  "\u{1F984}", "\u{1F435}", "\u{1F989}", "\u{1F43F}\uFE0F", "\u{1F9A5}", "\u{1F9A7}",
];

function useAnimalAvatar(userId: string | undefined) {
  const key = `avatar_${userId}`;
  const [animal, setAnimal] = useState(() => {
    if (!userId) return ANIMALS[0];
    return localStorage.getItem(key) || "";
  });

  useEffect(() => {
    if (userId) {
      const saved = localStorage.getItem(key);
      if (saved) setAnimal(saved);
    }
  }, [userId, key]);

  const pickAnimal = (emoji: string) => {
    setAnimal(emoji);
    if (userId) localStorage.setItem(key, emoji);
  };

  return { animal, pickAnimal, hasChosen: !!animal };
}

function AnimalPicker({ userId }: { userId: string | undefined }) {
  const { animal, pickAnimal, hasChosen } = useAnimalAvatar(userId);
  const [showPicker, setShowPicker] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hasChosen) setShowPicker(true);
  }, [hasChosen]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setShowPicker(false);
    }
    if (showPicker) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showPicker]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setShowPicker(!showPicker)}
        className="text-xl hover:scale-110 transition-transform cursor-pointer"
        title="Pick your avatar"
      >
        {animal || "\u{2753}"}
      </button>
      {showPicker && (
        <div className="absolute top-full right-0 mt-2 bg-zinc-900 border border-zinc-700 rounded-xl p-3 shadow-xl z-[100] w-64">
          <p className="text-xs text-zinc-400 mb-2">Pick your buddy</p>
          <div className="grid grid-cols-6 gap-1">
            {ANIMALS.map((a) => (
              <button
                key={a}
                onClick={() => { pickAnimal(a); setShowPicker(false); }}
                className={`text-xl p-1.5 rounded-lg hover:bg-zinc-800 transition-colors ${animal === a ? "bg-violet-500/20 ring-1 ring-violet-500" : ""}`}
              >
                {a}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/ideas", label: "Original Ideas", icon: Lightbulb },
  { to: "/competitor-ideas", label: "Competitor Ideas", icon: Swords },
  { to: "/posts", label: "Posts", icon: FileText },
  { to: "/reels/stage1", label: "Reels Stage 1", icon: Film },
  { to: "/reels/main", label: "Main Reels", icon: Radio },
  { to: "/growth", label: "Growth", icon: TrendingUp },
  { to: "/pages", label: "Pages", icon: Users },
];

function HamburgerMenu() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

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
        <SheetContent side="left" className="w-64 bg-zinc-950 border-zinc-800 p-0 flex flex-col">
          <div className="px-5 py-6 border-b border-zinc-800">
            <h1 className="text-lg font-bold text-white tracking-tight">FSBOARD</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Frontseat Media</p>
          </div>
          <nav className="px-3 py-4 space-y-1 flex-1">
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
          <div className="px-3 py-4 border-t border-zinc-800">
            <p className="px-3 text-xs text-zinc-600 truncate mb-2">{user?.email}</p>
            <button
              onClick={signOut}
              className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors w-full text-left text-red-400 hover:text-red-300 hover:bg-zinc-900"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function AppLayout() {
  const location = useLocation();
  const { user, signOut } = useAuth();

  const isFullScreen =
    location.pathname === "/" ||
    location.pathname === "/ideas" ||
    location.pathname === "/competitor-ideas" ||
    location.pathname.startsWith("/page/");

  if (isFullScreen) {
    return (
      <div className="relative">
        <HamburgerMenu />
        <div className="fixed top-5 right-5 z-50 flex items-center gap-3 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl px-4 py-2 shadow-lg">
          <AnimalPicker userId={user?.id} />
          <p className="text-sm text-zinc-400">
            {getGreeting()}, <span className="text-white font-medium">{getFirstName(user)}</span>
          </p>
          <button
            onClick={signOut}
            className="h-7 w-7 rounded-lg hover:bg-white/10 flex items-center justify-center transition-colors"
            title="Sign out"
          >
            <LogOut className="w-3.5 h-3.5 text-zinc-400 hover:text-red-400" />
          </button>
        </div>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/ideas" element={<IdeaEngine />} />
          <Route path="/competitor-ideas" element={<CompetitorIdeas />} />
          <Route path="/page/:pageId" element={<PageDetail />} />
        </Routes>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-zinc-950">
      {/* Sidebar */}
      <aside className="w-60 shrink-0 border-r border-zinc-800 bg-zinc-950 flex flex-col">
        <div className="px-5 py-5 border-b border-zinc-800">
          <h1 className="text-lg font-bold tracking-tight text-white">
            FSBOARD
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">Frontseat Media</p>
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

        <div className="px-3 py-4 border-t border-zinc-800">
          <div className="flex items-center gap-2 px-3 mb-1">
            <AnimalPicker userId={user?.id} />
            <p className="text-sm text-zinc-400 truncate">
              {getGreeting()}, <span className="text-white font-medium">{getFirstName(user)}</span>
            </p>
          </div>
          <p className="px-3 text-xs text-zinc-600 truncate mb-2">{user?.email}</p>
          <button
            onClick={signOut}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors w-full text-left text-red-400 hover:text-red-300 hover:bg-zinc-900"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto bg-zinc-950">
        <Routes>
          <Route path="/pages" element={<PagesView />} />
          <Route path="/posts" element={<PostsView />} />
          <Route path="/reels/stage1" element={<ReelsStage1View />} />
          <Route path="/reels/main" element={<MainReelsView />} />
          <Route path="/growth" element={<GrowthView />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </div>
  );
}

function AuthGate() {
  const { user, loading, domainError } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-zinc-500 text-sm">Loading...</div>
      </div>
    );
  }

  if (domainError) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center space-y-4 px-6">
          <h1 className="text-2xl font-bold text-white">Access Denied</h1>
          <p className="text-sm text-zinc-400">
            Only <span className="text-violet-400">@owledmedia.com</span> email addresses are allowed.
          </p>
          <p className="text-xs text-zinc-600">
            You signed in with a different email. Please try again with your Owled Media account.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm rounded-lg"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return (
    <>
      <AppLayout />
      <ChatBubble />
    </>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AuthGate />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
