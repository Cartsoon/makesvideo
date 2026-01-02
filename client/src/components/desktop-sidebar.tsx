import { Link, useLocation } from "wouter";
import { Clapperboard, Radar, Scissors, Film, Settings, Play, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { LanguageToggle } from "@/components/language-toggle";
import { InfoModal } from "@/components/info-modal";
import { ProfileModal } from "@/components/profile-modal";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function DesktopSidebar() {
  const [location] = useLocation();
  const { t } = useI18n();
  const { user, setUser, logout } = useAuth();

  const navItems = [
    { href: "/", icon: Clapperboard, label: t("nav.dashboard") },
    { href: "/sources", icon: Radar, label: t("nav.sources") },
    { href: "/topics", icon: Scissors, label: t("nav.topics") },
    { href: "/scripts", icon: Film, label: t("nav.scripts") },
    { href: "/settings", icon: Settings, label: t("nav.settings") },
  ];

  return (
    <aside className="hidden md:flex md:w-56 md:flex-col md:fixed md:inset-y-0 z-50 border-r bg-sidebar">
      <div className="flex flex-col h-full">
        <Link href="/">
          <div className="flex items-center gap-2.5 h-14 px-3 border-b border-sidebar-border bg-gradient-to-r from-transparent via-sidebar to-transparent cursor-pointer hover-elevate active-elevate-2" data-testid="link-sidebar-logo-home">
            <div className="relative flex items-center justify-center w-9 h-9 rounded-sm bg-gradient-to-br from-rose-600 via-rose-500 to-amber-500 overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-white/20" />
              <div className="absolute inset-0">
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/50 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-300/50 to-transparent" />
              </div>
              <Play className="h-4 w-4 text-white relative z-10 drop-shadow-md" fill="white" />
              <div className="absolute -top-0.5 -left-0.5 w-1.5 h-1.5 border-t border-l border-cyan-400" />
              <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 border-t border-r border-rose-400" />
              <div className="absolute -bottom-0.5 -left-0.5 w-1.5 h-1.5 border-b border-l border-rose-400" />
              <div className="absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 border-b border-r border-cyan-400" />
            </div>
            <div className="flex flex-col">
              <span className="font-black text-sm tracking-tight leading-tight glitch-text" data-text="IDENGINE" data-testid="text-sidebar-title">
                IDENGINE
              </span>
              <span className="text-[9px] text-neutral-500 leading-tight tracking-[0.15em] uppercase">
                Shorts Factory
              </span>
            </div>
          </div>
        </Link>

        <nav className="flex-1 px-2 py-3 space-y-0.5">
          {navItems.map((item) => {
            const isActive = location === item.href || 
              (item.href !== "/" && location.startsWith(item.href));
            
            return (
              <Link key={item.href} href={item.href}>
                <button
                  className={cn(
                    "flex items-center gap-2.5 w-full px-2.5 py-2.5 text-xs font-medium transition-colors rounded-sm",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-sidebar-foreground hover:bg-sidebar-accent"
                  )}
                  data-testid={`sidebar-${item.href.replace("/", "") || "dashboard"}`}
                >
                  <item.icon className="h-4 w-4 flex-shrink-0" />
                  <span>{item.label}</span>
                </button>
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-sidebar-border space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Avatar className="h-6 w-6 border border-sidebar-border">
                <AvatarFallback className="text-[10px] bg-sidebar-accent">
                  {user?.nickname ? user.nickname.charAt(0).toUpperCase() : <User className="h-3 w-3" />}
                </AvatarFallback>
              </Avatar>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{t("profile.title")}</span>
            </div>
            {user ? (
              <ProfileModal
                user={user}
                onUserUpdate={setUser}
                onLogout={logout}
                trigger={
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" data-testid="button-profile">
                    {user.nickname || t("profile.title")}
                  </Button>
                }
              />
            ) : (
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" data-testid="button-profile" onClick={logout}>
                {t("profile.title")}
              </Button>
            )}
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{t("nav.info")}</span>
            <InfoModal variant="icon" />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{t("settings.language")}</span>
            <LanguageToggle />
          </div>
        </div>
      </div>
    </aside>
  );
}
