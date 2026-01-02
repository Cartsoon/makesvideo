import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";
import { ListSkeleton } from "@/components/loading-skeleton";
import { EmptyState } from "@/components/empty-state";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Scissors, 
  RefreshCw, 
  Check, 
  X, 
  ExternalLink,
  Loader2,
  ArrowUpDown
} from "lucide-react";
import type { Topic, TopicStatus, Job } from "@shared/schema";

export default function Topics() {
  const { toast } = useToast();
  const { t, language } = useI18n();
  const [, navigate] = useLocation();
  const [statusFilter, setStatusFilter] = useState<TopicStatus | "all">("all");
  const [sortBy, setSortBy] = useState<"score" | "date">("score");

  const { data: topics, isLoading } = useQuery<Topic[]>({
    queryKey: ["/api/topics"],
  });

  const { data: jobs } = useQuery<Job[]>({
    queryKey: ["/api/jobs"],
    refetchInterval: 2000,
  });

  useEffect(() => {
    const fetchTopicsJobs = jobs?.filter(j => j.kind === "fetch_topics") || [];
    const hasCompletedFetch = fetchTopicsJobs.some(j => j.status === "done");
    if (hasCompletedFetch) {
      queryClient.invalidateQueries({ queryKey: ["/api/topics"] });
    }
  }, [jobs]);

  const fetchMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/jobs", { kind: "fetch_topics", payload: {} }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      toast({ title: t("dashboard.fetchingTopics"), description: t("dashboard.fetchingDescription") });
    },
    onError: () => {
      toast({ title: t("common.error"), description: t("topics.fetchError"), variant: "destructive" });
    },
  });

  const selectMutation = useMutation({
    mutationFn: async (topicId: string) => {
      const res = await apiRequest("POST", `/api/topics/${topicId}/select`);
      return res.json();
    },
    onSuccess: (data: { scriptId?: string }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/topics"] });
      queryClient.invalidateQueries({ queryKey: ["/api/scripts"] });
      toast({ title: t("topics.scriptCreated"), description: t("topics.scriptCreatedDesc") });
      if (data?.scriptId) {
        navigate(`/script/${data.scriptId}`);
      }
    },
    onError: () => {
      toast({ title: t("common.error"), description: t("topics.selectError"), variant: "destructive" });
    },
  });

  const ignoreMutation = useMutation({
    mutationFn: (topicId: string) => apiRequest("PATCH", `/api/topics/${topicId}`, { status: "ignored" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/topics"] });
      toast({ title: t("topics.topicIgnored"), description: t("topics.topicIgnoredDesc") });
    },
  });

  const filteredTopics = topics
    ?.filter((topic) => statusFilter === "all" || topic.status === statusFilter)
    ?.sort((a, b) => {
      if (sortBy === "score") return b.score - a.score;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }) || [];

  const statusCounts = {
    all: topics?.length || 0,
    new: topics?.filter((t) => t.status === "new").length || 0,
    selected: topics?.filter((t) => t.status === "selected").length || 0,
    ignored: topics?.filter((t) => t.status === "ignored").length || 0,
  };

  const statusLabels: Record<string, string> = {
    all: t("topics.all"),
    new: t("topics.new"),
    selected: t("topics.selected"),
    ignored: t("topics.ignored"),
  };

  return (
    <Layout title={t("nav.topics")}>
      <div className="p-3 md:p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h1 className="text-base sm:text-xl font-semibold" data-testid="text-page-title">{t("topics.title")}</h1>
            <p className="text-muted-foreground text-xs">
              {t("topics.subtitle")}
            </p>
          </div>
          <Button
            onClick={() => fetchMutation.mutate()}
            disabled={fetchMutation.isPending}
            className="w-full sm:w-auto"
            data-testid="button-refresh-topics"
          >
            {fetchMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            {t("topics.refresh")}
          </Button>
        </div>

        <div className="flex flex-wrap gap-1 items-center">
          {(["all", "new", "selected", "ignored"] as const).map((status) => (
            <Button
              key={status}
              variant={statusFilter === status ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(status)}
              data-testid={`filter-${status}`}
              className="text-[10px] sm:text-xs px-1.5 sm:px-2 h-7"
            >
              {statusLabels[status]}
              <Badge
                variant="secondary"
                className="ml-1 text-[9px] h-4 px-1 no-default-hover-elevate no-default-active-elevate"
              >
                {statusCounts[status]}
              </Badge>
            </Button>
          ))}
          <div className="flex-1 min-w-0" />
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as "score" | "date")}>
            <SelectTrigger className="w-[100px] sm:w-[130px] text-[10px] sm:text-xs h-7" data-testid="select-sort">
              <ArrowUpDown className="h-3 w-3 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="score">{t("topics.sortByScore")}</SelectItem>
              <SelectItem value="date">{t("topics.sortByDate")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <ListSkeleton count={5} />
        ) : filteredTopics.length === 0 ? (
          <EmptyState
            icon={Scissors}
            title={statusFilter === "all" ? t("topics.noTopics") : t("topics.noFilteredTopics")}
            description={
              statusFilter === "all"
                ? t("topics.clickRefresh")
                : t("topics.noFilteredDesc")
            }
            action={
              statusFilter === "all"
                ? { label: t("topics.refresh"), onClick: () => fetchMutation.mutate() }
                : undefined
            }
          />
        ) : (
          <div className="space-y-1.5">
            {filteredTopics.map((topic) => (
              <Card key={topic.id} data-testid={`topic-card-${topic.id}`}>
                <CardContent className="p-2 sm:p-3">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-1.5 flex-wrap">
                        <h3 className="font-medium text-xs sm:text-sm line-clamp-2 break-words">
                          {language === "en" 
                            ? (topic.translatedTitleEn || topic.generatedTitle || topic.title)
                            : (topic.translatedTitle || topic.generatedTitle || topic.title)}
                        </h3>
                        <StatusBadge status={topic.status} className="flex-shrink-0" />
                      </div>
                      {(topic.insights?.summary || topic.rawText || topic.fullContent) && (
                        <p className="text-[10px] sm:text-xs text-muted-foreground line-clamp-2 mt-1">
                          {topic.insights?.summary || (topic.rawText || topic.fullContent || "").slice(0, 150)}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-1 text-[10px] sm:text-xs text-muted-foreground">
                        <span className="flex items-center gap-0.5">
                          <Scissors className="h-3 w-3" />
                          {topic.score}
                        </span>
                        <span>
                          {new Date(topic.createdAt).toLocaleDateString()}
                        </span>
                        {topic.url && (
                          <a
                            href={topic.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-0.5 hover:text-foreground"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </div>
                    {topic.status === "new" && (
                      <div className="flex gap-1 flex-shrink-0">
                        <Button
                          onClick={() => selectMutation.mutate(topic.id)}
                          disabled={selectMutation.isPending}
                          data-testid={`button-select-${topic.id}`}
                          size="sm"
                          className="text-[10px] sm:text-xs h-7 px-2"
                        >
                          {selectMutation.isPending ? (
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          ) : (
                            <Check className="h-3 w-3 mr-1" />
                          )}
                          <span className="hidden sm:inline">{t("topics.select")}</span>
                          <span className="sm:hidden">OK</span>
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => ignoreMutation.mutate(topic.id)}
                          disabled={ignoreMutation.isPending}
                          data-testid={`button-ignore-${topic.id}`}
                          size="sm"
                          className="text-[10px] sm:text-xs h-7 px-2"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
