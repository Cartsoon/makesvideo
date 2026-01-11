import { useState, useEffect } from "react";
import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { I18nProvider } from "@/lib/i18n";
import { AuthProvider, type AuthUser } from "@/lib/auth-context";
import { AdminAccessProvider, useAdminAccess } from "@/lib/admin-access";
import { Onboarding } from "@/components/onboarding";
import Dashboard from "@/pages/dashboard";
import Sources from "@/pages/sources";
import Topics from "@/pages/topics";
import Scripts from "@/pages/scripts";
import ScriptDetail from "@/pages/script-detail";
import TextToVideo from "@/pages/text-to-video";
import Assistant from "@/pages/assistant";
import KbAdmin from "@/pages/kb-admin";
import StockSearch from "@/pages/stock-search";
import Settings from "@/pages/settings";
import NotFound from "@/pages/not-found";

const ONBOARDING_KEY = "idengine-onboarding-complete";
const AUTH_KEY = "idengine-auth";
const USER_KEY = "idengine-user";

function ProtectedKbAdmin() {
  const { isUnlocked, isReady } = useAdminAccess();

  if (!isReady) {
    return null;
  }

  if (!isUnlocked) {
    return <Redirect to="/" />;
  }

  return <KbAdmin />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/sources" component={Sources} />
      <Route path="/topics" component={Topics} />
      <Route path="/scripts" component={Scripts} />
      <Route path="/script/:id" component={ScriptDetail} />
      <Route path="/text-to-video" component={TextToVideo} />
      <Route path="/assistant" component={Assistant} />
      <Route path="/stock-search" component={StockSearch} />
      <Route path="/kb-admin" component={ProtectedKbAdmin} />
      <Route path="/settings" component={Settings} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AppContent() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    const auth = sessionStorage.getItem(AUTH_KEY);
    const onboardingComplete = localStorage.getItem(ONBOARDING_KEY);
    const savedUser = sessionStorage.getItem(USER_KEY);
    
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch (e) {
        console.error("Failed to parse saved user");
      }
    }
    
    setIsAuthenticated(auth === "true");
    setShowOnboarding(!onboardingComplete || auth !== "true");
  }, []);

  const handleOnboardingComplete = (loggedInUser?: AuthUser) => {
    if (loggedInUser) {
      setUser(loggedInUser);
      sessionStorage.setItem(USER_KEY, JSON.stringify(loggedInUser));
    }
    setIsAuthenticated(true);
    setShowOnboarding(false);
  };

  const handleLogout = () => {
    sessionStorage.removeItem(AUTH_KEY);
    sessionStorage.removeItem(USER_KEY);
    setUser(null);
    setIsAuthenticated(false);
    setShowOnboarding(true);
  };

  if (isAuthenticated === null || showOnboarding === null) {
    return null;
  }

  if (showOnboarding || !isAuthenticated) {
    return <Onboarding onComplete={handleOnboardingComplete} requireAuth={true} />;
  }

  const handleSetUser = (newUser: AuthUser | null) => {
    setUser(newUser);
    if (newUser) {
      sessionStorage.setItem(USER_KEY, JSON.stringify(newUser));
    } else {
      sessionStorage.removeItem(USER_KEY);
    }
  };

  return (
    <AuthProvider user={user} setUser={handleSetUser} logout={handleLogout}>
      <Router />
    </AuthProvider>
  );
}

function App() {
  return (
    <ThemeProvider>
      <I18nProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <AdminAccessProvider>
              <AppContent />
            </AdminAccessProvider>
            <Toaster />
          </TooltipProvider>
        </QueryClientProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}

export default App;
