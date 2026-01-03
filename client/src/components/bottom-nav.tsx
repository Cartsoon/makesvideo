import { Link, useLocation } from "wouter";
import { LayoutDashboard, Rss, FileText, Settings, Bot } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

export function BottomNav() {
  const [location] = useLocation();
  const { t } = useI18n();

  const navItems = [
    { href: "/", icon: LayoutDashboard, label: t("nav.dashboard") },
    { href: "/sources", icon: Rss, label: t("nav.sources") },
    { href: "/scripts", icon: FileText, label: t("nav.scripts") },
    { href: "/assistant", icon: Bot, label: t("nav.assistant") },
    { href: "/settings", icon: Settings, label: t("nav.settings") },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-card md:hidden safe-bottom">
      <div className="flex items-center justify-around py-1">
        {navItems.map((item) => {
          const isActive = location === item.href || 
            (item.href !== "/" && location.startsWith(item.href));
          
          return (
            <Link key={item.href} href={item.href}>
              <button
                className={cn(
                  "flex flex-col items-center justify-center min-w-[56px] min-h-[44px] px-2 py-0.5 transition-colors",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover-elevate"
                )}
                data-testid={`nav-${item.href.replace("/", "") || "dashboard"}`}
              >
                <item.icon className={cn("h-4 w-4", isActive && "stroke-[2.5px]")} />
                <span className={cn(
                  "text-[10px] mt-0.5",
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
