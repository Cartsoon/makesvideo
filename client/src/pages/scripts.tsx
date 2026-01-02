import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";
import { ListSkeleton } from "@/components/loading-skeleton";
import { EmptyState } from "@/components/empty-state";
import { useI18n } from "@/lib/i18n";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  FileText, 
  Clock, 
  ArrowRight,
  Film
} from "lucide-react";
import type { Script, ScriptStatus, Topic } from "@shared/schema";
import { stylePresetLabels } from "@shared/schema";

export default function Scripts() {
  const { t } = useI18n();
  const [statusFilter, setStatusFilter] = useState<ScriptStatus | "all">("all");

  const { data: scripts, isLoading: scriptsLoading } = useQuery<Script[]>({
    queryKey: ["/api/scripts"],
  });

  const { data: topics } = useQuery<Topic[]>({
    queryKey: ["/api/topics"],
  });

  const topicsMap = new Map(topics?.map((t) => [t.id, t]) || []);

  const filteredScripts = scripts
    ?.filter((script) => statusFilter === "all" || script.status === statusFilter)
    ?.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()) || [];

  const statusCounts = {
    all: scripts?.length || 0,
    draft: scripts?.filter((s) => s.status === "draft").length || 0,
    generating: scripts?.filter((s) => s.status === "generating").length || 0,
    ready: scripts?.filter((s) => s.status === "ready").length || 0,
    approved: scripts?.filter((s) => s.status === "approved").length || 0,
    exported: scripts?.filter((s) => s.status === "exported").length || 0,
    error: scripts?.filter((s) => s.status === "error").length || 0,
  };

  const statusLabels: Record<string, string> = {
    all: t("topics.all"),
    draft: t("scripts.status.draft"),
    generating: t("scripts.status.generating"),
    ready: t("scripts.status.ready"),
    approved: t("scripts.status.approved"),
    exported: t("scripts.status.exported"),
    error: t("scripts.status.error"),
  };

  return (
    <Layout title={t("nav.scripts")}>
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-lg sm:text-2xl font-bold" data-testid="text-page-title">{t("scripts.title")}</h1>
            <p className="text-muted-foreground text-sm">
              {t("scripts.subtitle")}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1 sm:gap-2">
          {(["all", "draft", "generating", "ready", "approved", "exported", "error"] as const).map((status) => (
            <Button
              key={status}
              variant={statusFilter === status ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(status)}
              data-testid={`filter-${status}`}
              className="text-xs sm:text-sm px-2 sm:px-3"
            >
              <span className="hidden sm:inline">{statusLabels[status]}</span>
              <span className="sm:hidden">{statusLabels[status].slice(0, 5)}{statusLabels[status].length > 5 ? "" : ""}</span>
              <Badge
                variant="secondary"
                className="ml-1 sm:ml-2 text-[10px] sm:text-xs no-default-hover-elevate no-default-active-elevate"
              >
                {statusCounts[status]}
              </Badge>
            </Button>
          ))}
        </div>

        {scriptsLoading ? (
          <ListSkeleton count={5} />
        ) : filteredScripts.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={statusFilter === "all" ? t("scripts.noScripts") : t("scripts.noFilteredScripts")}
            description={
              statusFilter === "all"
                ? t("scripts.selectTopic")
                : t("scripts.noFilteredDesc")
            }
          />
        ) : (
          <div className="space-y-3">
            {filteredScripts.map((script) => {
              const topic = topicsMap.get(script.topicId);
              return (
                <Link key={script.id} href={`/script/${script.id}`}>
                  <Card className="hover-elevate cursor-pointer" data-testid={`script-card-${script.id}`}>
                    <CardContent className="p-4">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                        <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 flex-shrink-0">
                          <Film className="h-6 w-6 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start gap-2 flex-wrap">
                            <h3 className="font-medium line-clamp-2 break-words">
                              {script.displayName || script.hook || topic?.title || t("scripts.untitled")}
                            </h3>
                            <StatusBadge status={script.status} className="flex-shrink-0" />
                          </div>
                          <div className="flex items-center gap-3 mt-2 flex-wrap">
                            <Badge variant="outline" className="text-xs">
                              <Clock className="h-3 w-3 mr-1" />
                              {script.durationSec}{t("script.seconds")}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {t(`style.${script.stylePreset}`) || stylePresetLabels[script.stylePreset]}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {t("scripts.updated")} {new Date(script.updatedAt).toLocaleDateString()}
                            </span>
                          </div>
                          {script.error && (
                            <p className="text-sm text-destructive mt-2 line-clamp-1">
                              {script.error}
                            </p>
                          )}
                        </div>
                        <ArrowRight className="h-5 w-5 text-muted-foreground hidden sm:block flex-shrink-0" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
