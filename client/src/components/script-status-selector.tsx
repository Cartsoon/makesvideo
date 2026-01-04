import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import type { ScriptStatus } from "@shared/schema";

interface ScriptStatusSelectorProps {
  status: ScriptStatus;
  onChange: (status: ScriptStatus) => void;
  disabled?: boolean;
}

const mainStatuses: ScriptStatus[] = ["draft", "in_progress", "done"];

const statusLabels: Record<string, { ru: string; en: string }> = {
  draft: { ru: "Черновик", en: "Draft" },
  in_progress: { ru: "В работе", en: "In Progress" },
  done: { ru: "Готово", en: "Done" },
};

const activeStyles: Record<string, string> = {
  draft: "bg-muted/80 text-foreground border-border",
  in_progress: "bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/50",
  done: "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/50",
};

export function ScriptStatusSelector({ status, onChange, disabled }: ScriptStatusSelectorProps) {
  const { language } = useI18n();
  
  return (
    <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap">
      {mainStatuses.map((s) => {
        const isActive = status === s;
        const label = statusLabels[s]?.[language] || s;
        
        return (
          <button
            key={s}
            type="button"
            disabled={disabled}
            onClick={() => onChange(s)}
            className={cn(
              "px-1.5 sm:px-2.5 py-0.5 sm:py-1 text-[10px] sm:text-xs font-medium border transition-all duration-200",
              "hover-elevate active-elevate-2",
              isActive 
                ? activeStyles[s]
                : "bg-transparent text-muted-foreground border-transparent hover:border-border/50",
              disabled && "opacity-50 cursor-not-allowed"
            )}
            data-testid={`button-status-${s}`}
          >
            #{label}
          </button>
        );
      })}
    </div>
  );
}
