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
  ArrowUpDown,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import type { Topic, TopicStatus, Job } from "@shared/schema";

export default function Topics() {
  const { toast } = useToast();
  const { t, language } = useI18n();
  const [, navigate] = useLocation();
  const [statusFilter, setStatusFilter] = useState<TopicStatus | "all">("all");
  const [sortBy, setSortBy] = useState<"score" | "date">("score");
  const [processedJobIds, setProcessedJobIds] = useState<Set<string>>(new Set());
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());

  const toggleExpand = (topicId: string) => {
    setExpandedTopics(prev => {
      const next = new Set(prev);
      if (next.has(topicId)) {
        next.delete(topicId);
      } else {
        next.add(topicId);
      }
      return next;
    });
  };

  const { data: topics, isLoading } = useQuery<Topic[]>({
    queryKey: ["/api/topics"],
  });

  const { data: jobs } = useQuery<Job[]>({
    queryKey: ["/api/jobs"],
    refetchInterval: 2000,
  });

  useEffect(() => {
    const fetchTopicsJobs = jobs?.filter(j => j.kind === "fetch_topics" && j.status === "done") || [];
    const newlyCompletedJobs = fetchTopicsJobs.filter(j => !processedJobIds.has(j.id));
    
    if (newlyCompletedJobs.length > 0) {
      queryClient.invalidateQueries({ queryKey: ["/api/topics"] });
      setProcessedJobIds(prev => {
        const next = new Set(prev);
        newlyCompletedJobs.forEach(j => next.add(j.id));
        return next;
      });
    }
  }, [jobs, processedJobIds]);

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

  const missMutation = useMutation({
    mutationFn: (topicId: string) => apiRequest("PATCH", `/api/topics/${topicId}`, { status: "missed" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/topics"] });
      toast({ title: t("topics.topicMissed"), description: t("topics.topicMissedDesc") });
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
    in_progress: topics?.filter((t) => t.status === "in_progress").length || 0,
    missed: topics?.filter((t) => t.status === "missed").length || 0,
  };

  const statusLabels: Record<string, string> = {
    all: t("topics.all"),
    new: t("topics.new"),
    in_progress: t("topics.inProgress"),
    missed: t("topics.missed"),
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

        <div className="flex gap-1 items-center">
          {(["all", "new", "in_progress", "missed"] as const).map((status) => (
            <Button
              key={status}
              variant={statusFilter === status ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(status)}
              data-testid={`filter-${status}`}
              className="text-[9px] sm:text-xs px-1.5 sm:px-3 h-7 flex-shrink-0 gap-1"
            >
              {statusLabels[status]}
              <span className={`
                inline-flex items-center justify-center min-w-[1.1rem] h-[1.1rem] px-1 rounded-full text-[9px] font-bold
                ${statusFilter === status 
                  ? "bg-background/25 text-primary-foreground" 
                  : "bg-primary/10 text-foreground"}
              `}>
                {statusCounts[status]}
              </span>
            </Button>
          ))}
          <div className="flex-1" />
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as "score" | "date")}>
            <SelectTrigger className="w-[70px] sm:w-[130px] text-[10px] sm:text-xs h-7 flex-shrink-0" data-testid="select-sort">
              <ArrowUpDown className="h-3 w-3" />
              <span className="hidden sm:inline ml-1"><SelectValue /></span>
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
                      {topic.tags && topic.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {topic.tags.slice(0, 5).map((tag, idx) => (
                            <Badge
                              key={idx}
                              variant="secondary"
                              className="text-[9px] h-4 px-1.5 no-default-hover-elevate no-default-active-elevate"
                              data-testid={`tag-${topic.id}-${idx}`}
                            >
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      )}
                      {(topic.insights?.summary || topic.rawText || topic.fullContent) && (() => {
                        const fullText = topic.insights?.summary || topic.rawText || topic.fullContent || "";
                        const isExpanded = expandedTopics.has(topic.id);
                        const isLong = fullText.length > 150;
                        
                        return (
                          <div className="mt-1">
                            <p className={`text-[10px] sm:text-xs text-muted-foreground ${isExpanded ? "" : "line-clamp-2"}`}>
                              {isExpanded ? fullText : fullText.slice(0, 150)}
                              {!isExpanded && isLong && "..."}
                            </p>
                            {isLong && (
                              <button
                                onClick={() => toggleExpand(topic.id)}
                                className="text-[10px] sm:text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5 mt-0.5"
                                data-testid={`button-expand-${topic.id}`}
                              >
                                {isExpanded ? (
                                  <>
                                    <ChevronUp className="h-3 w-3" />
                                    <span>{t("common.showLess") || "Свернуть"}</span>
                                  </>
                                ) : (
                                  <>
                                    <ChevronDown className="h-3 w-3" />
                                    <span>{t("common.showMore") || "Показать полностью"}</span>
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        );
                      })()}
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
                          onClick={() => missMutation.mutate(topic.id)}
                          disabled={missMutation.isPending}
                          data-testid={`button-miss-${topic.id}`}
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
