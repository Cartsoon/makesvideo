import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
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
  ChevronDown,
  ChevronUp
} from "lucide-react";
import type { Topic, TopicStatus, Job } from "@shared/schema";
import placeholderImage from "@assets/file_0000000078a471f4af18c4a74cc26e4a_1767488305862.png";

export default function Topics() {
  const { toast } = useToast();
  const { t, language } = useI18n();
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const [statusFilter, setStatusFilter] = useState<TopicStatus | "all">("all");
  const [sortBy, setSortBy] = useState<"score" | "date">("date");
  const [processedJobIds, setProcessedJobIds] = useState<Set<string>>(new Set());
  const [expandedTopicId, setExpandedTopicId] = useState<string | null>(null);
  const [fadingOutIds, setFadingOutIds] = useState<Set<string>>(new Set());
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const highlightRef = useRef<HTMLDivElement>(null);

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

  // Handle highlight parameter from dashboard - scroll to topic and highlight it
  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const highlightId = params.get("highlight");
    
    if (highlightId && topics && topics.length > 0) {
      setHighlightedId(highlightId);
      
      // Wait for DOM to render, then scroll
      setTimeout(() => {
        const element = document.querySelector(`[data-topic-id="${highlightId}"]`);
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 100);
      
      // Remove highlight after animation (2.5s)
      setTimeout(() => {
        setHighlightedId(null);
        // Clean URL without highlight parameter
        window.history.replaceState({}, "", "/topics");
      }, 2500);
    }
  }, [searchString, topics]);

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
    mutationFn: async (topicId: string) => {
      setFadingOutIds(prev => new Set(prev).add(topicId));
      await new Promise(resolve => setTimeout(resolve, 300));
      return apiRequest("PATCH", `/api/topics/${topicId}`, { status: "missed" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/topics"] });
      toast({ title: t("topics.topicMissed"), description: t("topics.topicMissedDesc") });
    },
    onSettled: (_, __, topicId) => {
      setFadingOutIds(prev => {
        const next = new Set(prev);
        next.delete(topicId);
        return next;
      });
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
    ?.filter((topic) => {
      // Exclude system/synthetic topics
      if (topic.title === "__text_to_video__" || topic.title?.startsWith("__")) return false;
      // Keep fading items visible during animation, but exclude if status already changed
      if (fadingOutIds.has(topic.id) && topic.status !== "missed") return true;
      // For "all" filter, exclude "missed" and "in_progress" topics
      if (statusFilter === "all") {
        return topic.status !== "missed" && topic.status !== "in_progress";
      }
      return topic.status === statusFilter;
    })
    ?.sort((a, b) => {
      if (sortBy === "score") return b.score - a.score;
      // Sort by publishedAt (or createdAt as fallback), newest first
      const dateA = new Date(a.publishedAt || a.createdAt).getTime();
      const dateB = new Date(b.publishedAt || b.createdAt).getTime();
      return dateB - dateA;
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

  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());

  const getTopicImage = (topic: Topic): string => {
    if (topic.imageUrl && !imageErrors.has(topic.id)) {
      return topic.imageUrl;
    }
    return placeholderImage;
  };

  const handleImageError = (topicId: string) => {
    setImageErrors(prev => new Set(prev).add(topicId));
  };

  const getDisplayTitle = (topic: Topic): string => {
    if (language === "en") {
      return topic.translatedTitleEn || topic.generatedTitle || topic.title;
    }
    return topic.translatedTitle || topic.generatedTitle || topic.title;
  };

  return (
    <Layout title={t("nav.topics")}>
      <div className="p-3 md:p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Button
            onClick={() => fetchMutation.mutate()}
            disabled={fetchMutation.isPending}
            size="icon"
            data-testid="button-refresh-topics"
            className="shrink-0"
            style={{ borderRadius: '2px' }}
          >
            {fetchMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
          
          <div className="flex-1 overflow-x-auto scrollbar-hide">
            <div className="flex gap-1 min-w-max">
              {(["all", "new", "in_progress", "missed"] as const).map((status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  data-testid={`filter-${status}`}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
                    statusFilter === status 
                      ? 'bg-primary text-primary-foreground' 
                      : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                  }`}
                  style={{ borderRadius: '2px' }}
                >
                  {statusLabels[status]}
                  <span className={`px-1.5 py-0.5 text-[10px] font-semibold ${
                    statusFilter === status 
                      ? 'bg-primary-foreground/20 text-primary-foreground' 
                      : 'bg-background text-foreground'
                  }`} style={{ borderRadius: '2px' }}>
                    {statusCounts[status]}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <Select value={sortBy} onValueChange={(v) => setSortBy(v as "score" | "date")}>
            <SelectTrigger 
              className="w-9 h-9 shrink-0 flex items-center justify-center [&>svg:last-child]:hidden" 
              data-testid="select-sort"
              style={{ borderRadius: '2px' }}
            >
              <ArrowUpDown className="h-4 w-4" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="score">{t("topics.sortByScore")}</SelectItem>
              <SelectItem value="date">{t("topics.sortByDate")}</SelectItem>
            </SelectContent>
          </Select>

          {(topics?.length || 0) > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  disabled={clearAllMutation.isPending}
                  className="text-destructive shrink-0"
                  data-testid="button-clear-topics"
                  style={{ borderRadius: '2px' }}
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
                data-topic-id={topic.id}
                data-testid={`topic-card-${topic.id}`}
                className={`group bg-card border overflow-hidden hover-elevate transition-all duration-300 ${
                  fadingOutIds.has(topic.id) ? 'opacity-0 scale-95 -translate-y-2' : 'opacity-100 scale-100'
                } ${
                  highlightedId === topic.id 
                    ? 'border-2 animate-highlight-glow' 
                    : 'border-border'
                }`}
                style={{ borderRadius: '2px' }}
              >
                <div className="relative aspect-video overflow-hidden bg-muted">
                  <img
                    src={getTopicImage(topic)}
                    alt=""
                    className="w-full h-full object-cover transition-all duration-300 group-hover:scale-105 brightness-90 group-hover:brightness-100"
                    onError={() => handleImageError(topic.id)}
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent transition-opacity duration-300 group-hover:opacity-80" />
                  
                  <div className="absolute top-2 left-2 right-2 flex items-start justify-between gap-2">
                    <StatusBadge status={topic.status} className="text-[10px]" />
                    <div className="flex items-center gap-1 bg-black/60 px-1.5 py-0.5 text-white text-[10px]" style={{ borderRadius: '2px' }}>
                      <TrendingUp className="h-3 w-3" />
                      {topic.score}
                    </div>
                  </div>
                  
                  <div className="absolute bottom-2 left-2 right-2">
                    <h3 className="font-medium text-white text-sm leading-tight line-clamp-2 drop-shadow-lg">
                      {getDisplayTitle(topic)}
                    </h3>
                  </div>
                  
                  <button
                    onClick={() => setExpandedTopicId(expandedTopicId === topic.id ? null : topic.id)}
                    className="absolute bottom-2 right-2 p-1 bg-black/60 text-white transition-colors"
                    style={{ borderRadius: '2px' }}
                    data-testid={`button-expand-${topic.id}`}
                  >
                    {expandedTopicId === topic.id ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </button>
                </div>

                {expandedTopicId === topic.id && (
                  <div className="p-3 bg-muted/50 border-t border-border space-y-2">
                    <div>
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{language === "ru" ? "Заголовок" : "Title"}</span>
                      <p className="text-sm font-medium">{getDisplayTitle(topic)}</p>
                    </div>
                    {(topic.insights?.summary || topic.rawText) && (
                      <div>
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{language === "ru" ? "Описание" : "Description"}</span>
                        <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                          {topic.insights?.summary || topic.rawText}
                        </p>
                      </div>
                    )}
                  </div>
                )}

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
                        {new Date(topic.publishedAt || topic.createdAt).toLocaleDateString(language === "ru" ? "ru-RU" : "en-US", { day: "numeric", month: "short" })}
                        {" "}
                        <span className="text-muted-foreground/70">
                          {new Date(topic.publishedAt || topic.createdAt).toLocaleTimeString(language === "ru" ? "ru-RU" : "en-US", { hour: "2-digit", minute: "2-digit" })}
                        </span>
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
