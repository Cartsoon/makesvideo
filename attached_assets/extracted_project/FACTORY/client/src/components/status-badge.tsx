import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import type { ScriptStatus, TopicStatus, JobStatus } from "@shared/schema";

interface StatusBadgeProps {
  status: ScriptStatus | TopicStatus | JobStatus;
  className?: string;
}

const statusStyles: Record<string, string> = {
  // Script statuses  
  draft: "bg-muted text-muted-foreground",
  in_progress: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  done: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  generating: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  error: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  // Topic statuses
  new: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  selected: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  ignored: "bg-muted text-muted-foreground",
  // Job statuses
  queued: "bg-muted text-muted-foreground",
  running: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
};

const statusLabelsRu: Record<string, string> = {
  draft: "Черновик",
  in_progress: "В работе",
  done: "Готово",
  generating: "Генерация",
  error: "Ошибка",
  new: "Новый",
  selected: "Выбран",
  ignored: "Пропущен",
  queued: "В очереди",
  running: "Выполняется",
};

const statusLabelsEn: Record<string, string> = {
  draft: "Draft",
  in_progress: "In Progress",
  done: "Done",
  generating: "Generating",
  error: "Error",
  new: "New",
  selected: "Selected",
  ignored: "Ignored",
  queued: "Queued",
  running: "Running",
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const { language } = useI18n();
  const labels = language === "ru" ? statusLabelsRu : statusLabelsEn;
  
  return (
    <Badge
      variant="secondary"
      className={cn(
        "text-xs font-medium no-default-hover-elevate no-default-active-elevate",
        statusStyles[status] || statusStyles.draft,
        className
      )}
    >
      {labels[status] || status}
    </Badge>
  );
}
