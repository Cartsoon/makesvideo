import { Link } from "wouter";
import { LanguageToggle } from "@/components/language-toggle";
import { InfoModal } from "@/components/info-modal";
import { ProfileModal } from "@/components/profile-modal";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Play, User } from "lucide-react";

interface AppHeaderProps {
  title?: string;
}

export function AppHeader({ title = "IDENGINE" }: AppHeaderProps) {
  const { user, setUser, logout } = useAuth();

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60 safe-top">
      <div className="flex h-11 items-center justify-between gap-2 px-3">
        <Link href="/">
          <div className="flex items-center gap-2 cursor-pointer hover-elevate active-elevate-2 rounded-sm p-0.5 -m-0.5" data-testid="link-logo-home">
            <div className="relative flex items-center justify-center w-7 h-7 rounded-sm bg-gradient-to-br from-rose-600 via-rose-500 to-amber-500 overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-white/20" />
              <div className="absolute inset-0">
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/50 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-300/50 to-transparent" />
              </div>
              <Play className="h-3 w-3 text-white relative z-10 drop-shadow-md" fill="white" />
              <div className="absolute -top-0.5 -left-0.5 w-1 h-1 border-t border-l border-cyan-400" />
              <div className="absolute -top-0.5 -right-0.5 w-1 h-1 border-t border-r border-rose-400" />
              <div className="absolute -bottom-0.5 -left-0.5 w-1 h-1 border-b border-l border-rose-400" />
              <div className="absolute -bottom-0.5 -right-0.5 w-1 h-1 border-b border-r border-cyan-400" />
            </div>
            <div className="flex flex-col">
              <span className="font-black text-xs leading-tight glitch-text" data-text={title} data-testid="text-app-title">
                {title}
              </span>
              <span className="text-[8px] text-neutral-500 leading-tight tracking-[0.12em] uppercase">
                Shorts Factory
              </span>
            </div>
          </div>
        </Link>
        <div className="flex items-center gap-0.5">
          {user ? (
            <ProfileModal
              user={user}
              onUserUpdate={setUser}
              onLogout={logout}
              trigger={
                <Button variant="ghost" size="icon" data-testid="button-profile-mobile">
                  <User className="h-4 w-4" />
                </Button>
              }
            />
          ) : (
            <Button variant="ghost" size="icon" data-testid="button-profile-mobile" onClick={logout}>
              <User className="h-4 w-4" />
            </Button>
          )}
          <InfoModal variant="icon" />
          <LanguageToggle />
        </div>
      </div>
    </header>
  );
}
