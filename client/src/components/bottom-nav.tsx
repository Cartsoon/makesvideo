import { Link, useLocation } from "wouter";
import { Clapperboard, Radar, Scissors, Film, Settings, Bot, BookOpen, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { useAdminAccess } from "@/lib/admin-access";

export function BottomNav() {
  const [location] = useLocation();
  const { t, language } = useI18n();
  const { isUnlocked } = useAdminAccess();

  // Hide bottom nav on assistant page (it has its own mobile UI)
  if (location === "/assistant") {
    return null;
  }

  const navItems = [
    { href: "/", icon: Clapperboard, label: t("nav.dashboard") },
    { href: "/assistant", icon: Bot, label: language === "ru" ? "Ассистент" : "Assistant" },
    { href: "/stock-search", icon: Search, label: language === "ru" ? "Футажи" : "Stock" },
    { href: "/sources", icon: Radar, label: t("nav.sources") },
    { href: "/topics", icon: Scissors, label: t("nav.topics") },
    { href: "/scripts", icon: Film, label: t("nav.scripts") },
    ...(isUnlocked ? [{ href: "/kb-admin", icon: BookOpen, label: language === "ru" ? "База" : "KB" }] : []),
    { href: "/settings", icon: Settings, label: t("nav.settings") },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-card md:hidden safe-bottom">
      <div className="flex items-center overflow-x-auto scrollbar-hide py-1 px-1 gap-1">
        {navItems.map((item) => {
          const isActive = location === item.href || 
            (item.href !== "/" && location.startsWith(item.href));
          
          return (
            <Link key={item.href} href={item.href}>
              <button
                className={cn(
                  "flex flex-col items-center justify-center min-w-[52px] min-h-[44px] px-2 py-0.5 transition-colors flex-shrink-0",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover-elevate"
                )}
                data-testid={`nav-${item.href.replace("/", "") || "dashboard"}`}
              >
                <item.icon className={cn("h-4 w-4", isActive && "stroke-[2.5px]")} />
                <span className={cn(
                  "text-[10px] mt-0.5 whitespace-nowrap",
                  isActive ? "font-semibold" : "font-medium"
                )}>
                  {item.label}
                </span>
              </button>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
