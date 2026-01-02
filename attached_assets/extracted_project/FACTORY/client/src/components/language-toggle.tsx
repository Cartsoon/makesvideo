import { Button } from "@/components/ui/button";
import { useI18n, type Language } from "@/lib/i18n";
import { Globe, Languages } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const labels: Record<Language, { short: string; full: string }> = {
  ru: { short: "RU", full: "Русский" },
  en: { short: "EN", full: "English" },
};

export function LanguageToggle() {
  const { language, setLanguage } = useI18n();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" data-testid="button-language-toggle">
          <Languages className="h-4 w-4" />
          <span className="sr-only">Change language</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem 
          onClick={() => setLanguage("ru")}
          className={language === "ru" ? "bg-accent" : ""}
          data-testid="menu-item-language-ru"
        >
          <span className="font-mono mr-2 w-6">{labels.ru.short}</span>
          {labels.ru.full}
        </DropdownMenuItem>
        <DropdownMenuItem 
          onClick={() => setLanguage("en")}
          className={language === "en" ? "bg-accent" : ""}
          data-testid="menu-item-language-en"
        >
          <span className="font-mono mr-2 w-6">{labels.en.short}</span>
          {labels.en.full}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
