import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { 
  Scissors, 
  RefreshCw, 
  Check, 
  X, 
  ExternalLink,
  Loader2,
  ArrowUpDown,
  Trash2,
  Film,
  Sparkles,
  Clock,
  TrendingUp,
  AlertTriangle,
  Eye
} from "lucide-react";
import type { Topic, TopicStatus, Job } from "@shared/schema";

const PLACEHOLDER_IMAGES = [
  "https://images.unsplash.com/photo-1536240478700-b869070f9279?w=400&h=300&fit=crop",
  "https://images.unsplash.com/photo-1485846234645-a62644f84728?w=400&h=300&fit=crop",
  "https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?w=400&h=300&fit=crop",
  "https://images.unsplash.com/photo-1478720568477-152d9b164e26?w=400&h=300&fit=crop",
  "https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?w=400&h=300&fit=crop",
  "https://images.unsplash.com/photo-1598899134739-24c46f58b8c0?w=400&h=300&fit=crop",
];

function getPlaceholderImage(id: string): string {
  const hash = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return PLACEHOLDER_IMAGES[hash % PLACEHOLDER_IMAGES.length];
}

export default function Topics() {
  const { toast } = useToast();
  const { t, language } = useI18n();
  const [, navigate] = useLocation();
  const [statusFilter, setStatusFilter] = useState<TopicStatus | "all">("all");
  const [sortBy, setSortBy] = useState<"score" | "date">("score");
  const [processedJobIds, setProcessedJobIds] = useState<Set<string>>(new Set());

  const { data: topics, isLoading } = useQuery<Topic[]>({
    queryKey: ["/api/topics"],
    refetchInterval: 60000,
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

  const clearAllMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/topics"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/topics"] });
      toast({ title: t("topics.cleared") || "Cleared", description: t("topics.clearedDesc") || "All topics deleted" });
    },
    onError: () => {
      toast({ title: t("common.error"), description: t("topics.clearError") || "Failed to clear topics", variant: "destructive" });
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

  const getTopicImage = (topic: Topic): string => {
    return getPlaceholderImage(topic.id);
  };

  const getDisplayTitle = (topic: Topic): string => {
    if (language === "en") {
      return topic.translatedTitleEn || topic.generatedTitle || topic.title;
    }
    return topic.translatedTitle || topic.generatedTitle || topic.title;
  };

  return (
    <Layout title={t("nav.topics")}>
      <div className="p-3 md:p-4 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 flex items-center justify-center" style={{ clipPath: 'polygon(0 0, 100% 0, 100% 85%, 85% 100%, 0 100%)' }}>
              <Film className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-semibold" data-testid="text-page-title">{t("topics.title")}</h1>
              <p className="text-muted-foreground text-xs">{t("topics.subtitle")}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => fetchMutation.mutate()}
              disabled={fetchMutation.isPending}
              size="sm"
              data-testid="button-refresh-topics"
            >
              {fetchMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              {t("topics.refresh")}
            </Button>
            {(topics?.length || 0) > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={clearAllMutation.isPending}
                    className="text-destructive"
                    data-testid="button-clear-topics"
                  >
                    {clearAllMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="max-w-sm">
                  <AlertDialogHeader>
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 bg-destructive/10 flex items-center justify-center" style={{ borderRadius: '2px' }}>
                        <AlertTriangle className="h-5 w-5 text-destructive" />
                      </div>
                      <AlertDialogTitle className="text-base">
                        {language === "ru" ? "Удалить все топики?" : "Delete all topics?"}
                      </AlertDialogTitle>
                    </div>
                    <AlertDialogDescription className="text-sm">
                      {language === "ru" 
                        ? `Будет удалено ${topics?.length || 0} топиков. Это действие нельзя отменить.`
                        : `${topics?.length || 0} topics will be deleted. This action cannot be undone.`
                      }
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter className="gap-2 sm:gap-0">
                    <AlertDialogCancel data-testid="button-cancel-clear">
                      {language === "ru" ? "Отмена" : "Cancel"}
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => clearAllMutation.mutate()}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      data-testid="button-confirm-clear"
                    >
                      {language === "ru" ? "Удалить" : "Delete"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex gap-1 flex-1">
            {(["all", "new", "in_progress", "missed"] as const).map((status) => (
              <Button
                key={status}
                variant={statusFilter === status ? "default" : "ghost"}
                size="sm"
                onClick={() => setStatusFilter(status)}
                data-testid={`filter-${status}`}
                className="flex-1 text-xs px-2 h-8 gap-1"
              >
                {statusLabels[status]}
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px] no-default-hover-elevate no-default-active-elevate">
                  {statusCounts[status]}
                </Badge>
              </Button>
            ))}
          </div>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as "score" | "date")}>
            <SelectTrigger className="w-full sm:w-36 text-xs h-8" data-testid="select-sort">
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
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredTopics.map((topic) => (
              <div
                key={topic.id}
                data-testid={`topic-card-${topic.id}`}
                className="group bg-card border border-border overflow-hidden hover-elevate"
                style={{ borderRadius: '2px' }}
              >
                <div className="relative aspect-video overflow-hidden bg-muted">
                  <img
                    src={getTopicImage(topic)}
                    alt=""
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                  
                  <div className="absolute top-2 left-2 right-2 flex items-start justify-between gap-2">
                    <StatusBadge status={topic.status} className="text-[10px]" />
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1 bg-black/60 px-1.5 py-0.5 text-white text-[10px]" style={{ borderRadius: '2px' }}>
                        <Eye className="h-3 w-3" />
                        {topic.viewCount || 0}
                      </div>
                      <div className="flex items-center gap-1 bg-black/60 px-1.5 py-0.5 text-white text-[10px]" style={{ borderRadius: '2px' }}>
                        <TrendingUp className="h-3 w-3" />
                        {topic.score}
                      </div>
                    </div>
                  </div>
                  
                  <div className="absolute bottom-2 left-2 right-2">
                    <h3 className="font-medium text-white text-sm leading-tight line-clamp-2 drop-shadow-lg">
                      {getDisplayTitle(topic)}
                    </h3>
                  </div>
                </div>

                <div className="p-3 space-y-2">
                  {topic.tags && topic.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {topic.tags.slice(0, 4).map((tag, idx) => (
                        <span
                          key={idx}
                          className="text-[10px] px-1.5 py-0.5 bg-muted text-muted-foreground"
                          style={{ borderRadius: '2px' }}
                          data-testid={`tag-${topic.id}-${idx}`}
                        >
                          {tag}
                        </span>
                      ))}
                      {topic.tags.length > 4 && (
                        <span className="text-[10px] px-1.5 py-0.5 text-muted-foreground">
                          +{topic.tags.length - 4}
                        </span>
                      )}
                    </div>
                  )}

                  {(topic.insights?.summary || topic.rawText) && (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {(topic.insights?.summary || topic.rawText || "").slice(0, 120)}
                      {(topic.insights?.summary || topic.rawText || "").length > 120 && "..."}
                    </p>
                  )}

                  <div className="flex items-center justify-between pt-1 border-t border-border/50">
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(topic.createdAt).toLocaleDateString()}
                      </span>
                      {topic.url && (
                        <a
                          href={topic.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 hover:text-foreground transition-colors"
                          data-testid={`link-source-${topic.id}`}
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                    
                    {topic.status === "new" && (
                      <div className="flex gap-1">
                        <Button
                          onClick={() => selectMutation.mutate(topic.id)}
                          disabled={selectMutation.isPending}
                          data-testid={`button-select-${topic.id}`}
                          size="sm"
                          className="h-7 px-2 text-xs gap-1"
                        >
                          {selectMutation.isPending ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Sparkles className="h-3 w-3" />
                          )}
                          <span className="hidden sm:inline">{t("topics.select")}</span>
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => missMutation.mutate(topic.id)}
                          disabled={missMutation.isPending}
                          data-testid={`button-miss-${topic.id}`}
                          size="sm"
                          className="h-7 px-2"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
