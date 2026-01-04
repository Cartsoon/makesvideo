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
  draft: "bg-zinc-600 text-white",
  in_progress: "bg-amber-500 text-white dark:bg-amber-500 dark:text-white",
  done: "bg-emerald-500 text-white dark:bg-emerald-500 dark:text-white",
  generating: "bg-amber-500 text-white dark:bg-amber-500 dark:text-white",
  error: "bg-red-500 text-white dark:bg-red-500 dark:text-white",
  // Topic statuses - bright colors for visibility
  new: "bg-blue-500 text-white dark:bg-blue-500 dark:text-white",
  selected: "bg-emerald-500 text-white dark:bg-emerald-500 dark:text-white",
  ignored: "bg-zinc-500 text-white dark:bg-zinc-500 dark:text-white",
  missed: "bg-orange-500 text-white dark:bg-orange-500 dark:text-white",
  // Job statuses
  queued: "bg-zinc-500 text-white dark:bg-zinc-500 dark:text-white",
  running: "bg-amber-500 text-white dark:bg-amber-500 dark:text-white",
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
