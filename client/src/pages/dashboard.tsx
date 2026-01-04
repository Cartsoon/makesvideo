import { useEffect, useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { StatusBadge } from "@/components/status-badge";
import { ListSkeleton } from "@/components/loading-skeleton";
import { EmptyState } from "@/components/empty-state";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import { 
  RefreshCw, 
  Scissors, 
  Film, 
  ArrowRight,
  Loader2,
  Radar,
  Clock,
  Type,
  Upload,
  Sparkles,
  FolderUp,
  Play,
  ChevronRight,
  TrendingUp,
  Settings
} from "lucide-react";
import type { Topic, Script, Job } from "@shared/schema";
import { ComingSoonModal } from "@/components/coming-soon-modal";
import placeholderImage from "@assets/file_0000000078a471f4af18c4a74cc26e4a_1767488305862.png";

export default function Dashboard() {
  const { toast } = useToast();
  const { t, language } = useI18n();
  const [, navigate] = useLocation();
  const [comingSoonOpen, setComingSoonOpen] = useState(false);
  const [processedJobIds, setProcessedJobIds] = useState<Set<string>>(new Set());
  const [quickText, setQuickText] = useState("");
  
  const [prevTopicIds, setPrevTopicIds] = useState<Set<string>>(new Set());
  const [newlyAddedIds, setNewlyAddedIds] = useState<Set<string>>(new Set());
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());
  const [completingJobIds, setCompletingJobIds] = useState<Set<string>>(new Set());
  
  const handleQuickTextSubmit = () => {
    if (quickText.trim()) {
      navigate(`/text-to-video?text=${encodeURIComponent(quickText.trim())}`);
    }
  };

  const getTopicImage = (topic: Topic): string => {
    if (topic.imageUrl && !imageErrors.has(topic.id)) {
      return topic.imageUrl;
    }
    return placeholderImage;
  };

  const handleImageError = (topicId: string) => {
    setImageErrors(prev => new Set(prev).add(topicId));
  };

  const { data: topics, isLoading: topicsLoading } = useQuery<Topic[]>({
    queryKey: ["/api/topics"],
    refetchInterval: 60000, // Auto-refresh every 60 seconds
  });

  const { data: scripts, isLoading: scriptsLoading } = useQuery<Script[]>({
    queryKey: ["/api/scripts"],
  });

  const { data: jobs, isLoading: jobsLoading } = useQuery<Job[]>({
    queryKey: ["/api/jobs"],
    refetchInterval: 2000,
  });

  useEffect(() => {
    const fetchTopicsJobs = jobs?.filter(j => j.kind === "fetch_topics" && j.status === "done") || [];
    
    setProcessedJobIds(prev => {
      const newlyCompletedJobs = fetchTopicsJobs.filter(j => !prev.has(j.id));
      if (newlyCompletedJobs.length > 0) {
        queryClient.invalidateQueries({ queryKey: ["/api/topics"] });
        queryClient.invalidateQueries({ queryKey: ["/api/scripts"] });
        const next = new Set(prev);
        newlyCompletedJobs.forEach(j => next.add(j.id));
        return next;
      }
      return prev;
    });
  }, [jobs]);

  const activeJobs = jobs?.filter(j => j.status === "running" || j.status === "queued") || [];
  const hasPendingFetchTopics = activeJobs.some(j => j.kind === "fetch_topics");
  
  // Track jobs that just completed - show 100% briefly before hiding
  const prevActiveJobIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const currentActiveIds = new Set(activeJobs.map(j => j.id));
    const justCompleted = Array.from(prevActiveJobIdsRef.current).filter(id => !currentActiveIds.has(id));
    
    if (justCompleted.length > 0) {
      // Add to completing set
      setCompletingJobIds(prev => {
        const next = new Set(prev);
        justCompleted.forEach(id => next.add(id));
        return next;
      });
      // Remove after animation
      setTimeout(() => {
        setCompletingJobIds(prev => {
          const next = new Set(prev);
          justCompleted.forEach(id => next.delete(id));
          return next;
        });
      }, 600);
    }
    prevActiveJobIdsRef.current = currentActiveIds;
  }, [activeJobs]);

  const fetchTopicsMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/jobs", { kind: "fetch_topics", payload: {} }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      toast({
        title: t("dashboard.fetchingTopics"),
        description: t("dashboard.fetchingDescription"),
      });
    },
    onError: () => {
      toast({
        title: t("common.error"),
        description: t("dashboard.fetchError"),
        variant: "destructive",
      });
    },
  });

  const handleFetchTopics = () => {
    if (hasPendingFetchTopics) return;
    fetchTopicsMutation.mutate();
  };

  // Filter topics same as Topics page: exclude system, missed, in_progress
  // Sort by publishedAt (or createdAt as fallback), newest first - same as Topics page
  const filteredTopics = topics?.filter(t => 
    !t.title?.startsWith("__") && 
    t.status !== "missed" && 
    t.status !== "in_progress"
  ) || [];
  const recentTopics = filteredTopics
    .sort((a, b) => {
      const dateA = new Date(a.publishedAt || a.createdAt).getTime();
      const dateB = new Date(b.publishedAt || b.createdAt).getTime();
      return dateB - dateA;
    })
    .slice(0, 6);
  // For animation tracking, use the filtered list
  const newTopics = filteredTopics;
  const recentScripts = scripts
    ?.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 4) || [];

  // Track newly added topics for animation
  const topicIdsString = newTopics.map(t => t.id).join(',');
  useEffect(() => {
    if (!topicIdsString) return;
    
    const currentIds = new Set(topicIdsString.split(',').filter(Boolean));
    
    if (prevTopicIds.size > 0) {
      const newIds = new Set<string>();
      currentIds.forEach(id => {
        if (!prevTopicIds.has(id)) {
          newIds.add(id);
        }
      });
      
      if (newIds.size > 0) {
        setNewlyAddedIds(newIds);
        // Clear animation after 2 seconds
        setTimeout(() => setNewlyAddedIds(new Set()), 2000);
      }
    }
    
    setPrevTopicIds(currentIds);
  }, [topicIdsString]);

  const stats = {
    totalTopics: filteredTopics.length,
    totalScripts: scripts?.length || 0,
    readyScripts: scripts?.filter(s => s.status === "done").length || 0,
  };

  return (
    <Layout title={t("nav.dashboard")}>
      <div className="p-3 md:p-4 space-y-3">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <div className="w-1 h-6 bg-gradient-to-b from-rose-500 to-amber-500" />
                <h1 className="text-lg sm:text-2xl font-bold text-white uppercase tracking-wide" data-testid="text-page-title">
                  {t("dashboard.title")}
                </h1>
              </div>
            </div>
            <Link href="/settings">
              <div
                className="relative overflow-hidden px-4 py-2.5 sm:px-5 sm:py-3 border border-neutral-600/50 bg-neutral-800/80 text-white font-semibold text-sm uppercase tracking-wide hover-elevate active-elevate-2 flex items-center justify-center gap-2 w-full sm:w-auto flex-shrink-0 cursor-pointer"
                data-testid="button-settings"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-neutral-700/20 via-transparent to-neutral-600/20" />
                <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-neutral-500" />
                <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-neutral-500" />
                <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-neutral-600" />
                <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-neutral-600" />
                <span className="relative flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  {t("nav.settings")}
                </span>
              </div>
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <Link href="/topics">
            <div className={`group relative overflow-hidden px-3 py-2 border bg-neutral-900/90 hover-elevate active-elevate-2 transition-all cursor-pointer ${
              stats.totalTopics > 0 
                ? "border-emerald-500/40" 
                : "border-neutral-600/40"
            }`}>
              <div className={`absolute inset-0 ${
                stats.totalTopics > 0 
                  ? "bg-gradient-to-br from-emerald-500/10 via-transparent to-emerald-600/10" 
                  : "bg-gradient-to-br from-neutral-500/10 via-transparent to-neutral-600/10"
              }`} />
              <div className="absolute -right-2 -bottom-2 opacity-[0.04]">
                <Scissors className="w-12 h-12" />
              </div>
              <div className={`absolute top-0 left-0 w-1.5 h-1.5 border-t border-l ${stats.totalTopics > 0 ? "border-emerald-400" : "border-neutral-500"}`} />
              <div className={`absolute top-0 right-0 w-1.5 h-1.5 border-t border-r ${stats.totalTopics > 0 ? "border-emerald-400" : "border-neutral-500"}`} />
              <div className={`absolute bottom-0 left-0 w-1.5 h-1.5 border-b border-l ${stats.totalTopics > 0 ? "border-emerald-500" : "border-neutral-600"}`} />
              <div className={`absolute bottom-0 right-0 w-1.5 h-1.5 border-b border-r ${stats.totalTopics > 0 ? "border-emerald-500" : "border-neutral-600"}`} />
              <div className="relative flex items-center justify-center gap-2">
                <div className="relative">
                  <div className={`absolute inset-0 blur-md ${stats.totalTopics > 0 ? "bg-emerald-400/30" : "bg-neutral-400/20"}`} />
                  <Scissors className={`relative h-4 w-4 ${stats.totalTopics > 0 ? "text-emerald-400" : "text-neutral-400"}`} />
                </div>
                <span className={`text-lg font-bold ${stats.totalTopics > 0 ? "text-emerald-400" : "text-neutral-400"}`} data-testid="stat-total-topics">{stats.totalTopics}</span>
                <span className={`text-[8px] uppercase tracking-wide hidden sm:inline ${stats.totalTopics > 0 ? "text-emerald-400/70" : "text-neutral-400"}`}>{t("dashboard.totalTopics")}</span>
              </div>
              <p className={`text-[7px] text-center mt-0.5 sm:hidden uppercase tracking-wide relative ${stats.totalTopics > 0 ? "text-emerald-400/70" : "text-neutral-500"}`}>{t("dashboard.totalTopics")}</p>
            </div>
          </Link>

          <Link href="/scripts">
            <div className={`group relative overflow-hidden px-3 py-2 border bg-neutral-900/90 hover-elevate active-elevate-2 transition-all cursor-pointer ${
              stats.totalScripts > 0 
                ? "border-emerald-500/40" 
                : "border-neutral-600/40"
            }`}>
              <div className={`absolute inset-0 ${
                stats.totalScripts > 0 
                  ? "bg-gradient-to-br from-emerald-500/10 via-transparent to-emerald-600/10" 
                  : "bg-gradient-to-br from-neutral-500/10 via-transparent to-neutral-600/10"
              }`} />
              <div className="absolute -right-2 -bottom-2 opacity-[0.04]">
                <Film className="w-12 h-12" />
              </div>
              <div className={`absolute top-0 left-0 w-1.5 h-1.5 border-t border-l ${stats.totalScripts > 0 ? "border-emerald-400" : "border-neutral-500"}`} />
              <div className={`absolute top-0 right-0 w-1.5 h-1.5 border-t border-r ${stats.totalScripts > 0 ? "border-emerald-400" : "border-neutral-500"}`} />
              <div className={`absolute bottom-0 left-0 w-1.5 h-1.5 border-b border-l ${stats.totalScripts > 0 ? "border-emerald-500" : "border-neutral-600"}`} />
              <div className={`absolute bottom-0 right-0 w-1.5 h-1.5 border-b border-r ${stats.totalScripts > 0 ? "border-emerald-500" : "border-neutral-600"}`} />
              <div className="relative flex items-center justify-center gap-2">
                <div className="relative">
                  <div className={`absolute inset-0 blur-md ${stats.totalScripts > 0 ? "bg-emerald-400/30" : "bg-neutral-400/20"}`} />
                  <Film className={`relative h-4 w-4 ${stats.totalScripts > 0 ? "text-emerald-400" : "text-neutral-400"}`} />
                </div>
                <span className={`text-lg font-bold ${stats.totalScripts > 0 ? "text-emerald-400" : "text-neutral-400"}`} data-testid="stat-total-scripts">{stats.totalScripts}</span>
                <span className={`text-[8px] uppercase tracking-wide hidden sm:inline ${stats.totalScripts > 0 ? "text-emerald-400/70" : "text-neutral-400"}`}>{t("dashboard.scriptsInWork")}</span>
              </div>
              <p className={`text-[7px] text-center mt-0.5 sm:hidden uppercase tracking-wide relative ${stats.totalScripts > 0 ? "text-emerald-400/70" : "text-neutral-500"}`}>{t("dashboard.scriptsInWorkShort")}</p>
            </div>
          </Link>

          <Link href="/scripts">
            <div className={`group relative overflow-hidden px-3 py-2 border bg-neutral-900/90 hover-elevate active-elevate-2 transition-all cursor-pointer ${
              stats.readyScripts > 0 
                ? "border-emerald-500/40" 
                : "border-neutral-600/40"
            }`}>
              <div className={`absolute inset-0 ${
                stats.readyScripts > 0 
                  ? "bg-gradient-to-br from-emerald-500/10 via-transparent to-emerald-600/10" 
                  : "bg-gradient-to-br from-neutral-500/10 via-transparent to-neutral-600/10"
              }`} />
              <div className="absolute -right-2 -bottom-2 opacity-[0.04]">
                <Play className="w-12 h-12" />
              </div>
              <div className={`absolute top-0 left-0 w-1.5 h-1.5 border-t border-l ${stats.readyScripts > 0 ? "border-emerald-400" : "border-neutral-500"}`} />
              <div className={`absolute top-0 right-0 w-1.5 h-1.5 border-t border-r ${stats.readyScripts > 0 ? "border-emerald-400" : "border-neutral-500"}`} />
              <div className={`absolute bottom-0 left-0 w-1.5 h-1.5 border-b border-l ${stats.readyScripts > 0 ? "border-emerald-500" : "border-neutral-600"}`} />
              <div className={`absolute bottom-0 right-0 w-1.5 h-1.5 border-b border-r ${stats.readyScripts > 0 ? "border-emerald-500" : "border-neutral-600"}`} />
              <div className="relative flex items-center justify-center gap-2">
                <div className="relative">
                  <div className={`absolute inset-0 blur-md ${stats.readyScripts > 0 ? "bg-emerald-400/30" : "bg-neutral-400/20"}`} />
                  <Play className={`relative h-4 w-4 ${stats.readyScripts > 0 ? "text-emerald-400" : "text-neutral-400"}`} />
                </div>
                <span className={`text-lg font-bold ${stats.readyScripts > 0 ? "text-emerald-400" : "text-neutral-400"}`} data-testid="stat-ready-scripts">{stats.readyScripts}</span>
                <span className={`text-[8px] uppercase tracking-wide hidden sm:inline ${stats.readyScripts > 0 ? "text-emerald-400/70" : "text-neutral-400"}`}>{t("dashboard.readyScripts")}</span>
              </div>
              <p className={`text-[7px] text-center mt-0.5 sm:hidden uppercase tracking-wide relative ${stats.readyScripts > 0 ? "text-emerald-400/70" : "text-neutral-500"}`}>{t("dashboard.readyScriptsShort")}</p>
            </div>
          </Link>
        </div>

        <div className="flex flex-col gap-3">

          <div className="grid grid-cols-2 gap-3">
            <Link href="/text-to-video" className="block sm:hidden">
              <div
                className="group relative overflow-hidden p-4 border border-rose-500/30 bg-neutral-900/90 dark:bg-neutral-900/90 hover-elevate active-elevate-2 transition-all w-full cursor-pointer"
                data-testid="panel-create-from-text-mobile"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-rose-500/20 via-transparent to-amber-500/20 opacity-60" />
                
                <div className="absolute -right-6 -bottom-6 opacity-[0.04]">
                  <Type className="w-28 h-28" />
                </div>
                
                <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-rose-400" />
                <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-rose-400" />
                <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-amber-400" />
                <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-amber-400" />
                
                <div className="relative flex flex-col items-center gap-3 text-center">
                  <div className="relative">
                    <div className="absolute inset-0 blur-xl bg-rose-400/40" />
                    <div className="relative flex items-center justify-center">
                      <div className="absolute w-14 h-14 border border-rose-400/30 rotate-45" />
                      <div className="w-10 h-10 flex items-center justify-center">
                        <Type className="h-6 w-6 text-rose-400" />
                      </div>
                    </div>
                  </div>
                  <div>
                    <p className="font-bold text-sm text-white uppercase tracking-wide">
                      {t("dashboard.createFromTextShort")}
                    </p>
                    <p className="text-[10px] text-neutral-400 mt-1">
                      {language === "ru" ? "Текст или ссылка" : "Text or link"}
                    </p>
                  </div>
                </div>
                <Sparkles className="absolute top-3 right-3 h-4 w-4 text-amber-400/60" />
              </div>
            </Link>

            <div
              className="group relative overflow-hidden p-5 border border-rose-500/30 bg-neutral-900/90 dark:bg-neutral-900/90 transition-all w-full hidden sm:block"
              data-testid="panel-create-from-text"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-rose-500/20 via-transparent to-amber-500/20 opacity-60" />
              
              <div className="absolute -right-4 -bottom-4 opacity-[0.04]">
                <Type className="w-32 h-32" />
              </div>
              <div className="absolute left-2 top-1/2 -translate-y-1/2 opacity-[0.06]">
                <div className="flex flex-col gap-1">
                  <div className="w-6 h-0.5 bg-current" />
                  <div className="w-8 h-0.5 bg-current" />
                  <div className="w-5 h-0.5 bg-current" />
                  <div className="w-7 h-0.5 bg-current" />
                </div>
              </div>
              <div className="absolute right-8 top-6 opacity-[0.05] rotate-12">
                <Sparkles className="w-8 h-8" />
              </div>
              
              <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-rose-400" />
              <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-rose-400" />
              <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-amber-400" />
              <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-amber-400" />
              
              <div className="relative flex flex-col gap-4">
                <Link href="/text-to-video">
                  <div className="flex items-start gap-4 cursor-pointer -m-2 p-2">
                    <div className="relative flex-shrink-0 w-14 h-14 flex items-center justify-center">
                      <div className="absolute inset-0 blur-xl bg-rose-400/30" />
                      <div className="absolute inset-1 border border-rose-400/40 rotate-45" />
                      <Type className="h-6 w-6 text-rose-400 relative z-10" />
                    </div>
                    <div className="flex-1 min-w-0 pt-1">
                      <p className="font-bold text-sm text-white uppercase tracking-wide leading-tight">
                        {t("dashboard.createFromText")}
                      </p>
                      <p className="text-[10px] text-neutral-300 mt-1 leading-relaxed">
                        {t("dashboard.createFromTextDesc")}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-rose-400/60 flex-shrink-0 mt-1" />
                  </div>
                </Link>
                
                <div className="relative flex gap-2">
                  <input
                    type="text"
                    value={quickText}
                    onChange={(e) => setQuickText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleQuickTextSubmit()}
                    placeholder={language === "ru" ? "Вставьте текст или ссылку..." : "Paste text or link..."}
                    className="flex-1 h-9 px-3 bg-neutral-800/80 border border-neutral-700/50 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:border-rose-400/50 transition-colors"
                    style={{ borderRadius: '2px' }}
                    data-testid="input-quick-text"
                  />
                  <button
                    onClick={handleQuickTextSubmit}
                    disabled={!quickText.trim()}
                    className="h-9 px-3 bg-gradient-to-r from-rose-500 to-amber-500 text-white text-xs font-semibold uppercase tracking-wide disabled:opacity-40 disabled:cursor-not-allowed hover-elevate active-elevate-2 transition-all flex items-center gap-1.5"
                    style={{ borderRadius: '2px' }}
                    data-testid="button-quick-submit"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>{language === "ru" ? "Создать" : "Create"}</span>
                  </button>
                </div>
              </div>
              <Sparkles className="absolute top-3 right-3 h-4 w-4 text-amber-400/60" />
            </div>

            <button
              className="group relative overflow-hidden p-4 sm:p-5 border border-blue-500/30 bg-neutral-900/90 dark:bg-neutral-900/90 hover-elevate active-elevate-2 transition-all cursor-pointer"
              data-testid="button-create-from-material"
              onClick={() => setComingSoonOpen(true)}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/20 via-transparent to-cyan-500/20 opacity-60" />
              
              <div className="absolute -right-6 -bottom-6 opacity-[0.04]">
                <Film className="w-28 h-28 sm:w-36 sm:h-36" />
              </div>
              <div className="absolute left-2 top-8 opacity-[0.06]">
                <div className="flex gap-0.5">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="w-1.5 h-3 bg-current" />
                  ))}
                </div>
              </div>
              <div className="absolute left-2 bottom-8 opacity-[0.06]">
                <div className="flex gap-0.5">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="w-1.5 h-3 bg-current" />
                  ))}
                </div>
              </div>
              <div className="absolute right-10 top-8 opacity-[0.05] -rotate-12">
                <Play className="w-6 h-6" />
              </div>
              
              <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-blue-400" />
              <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-blue-400" />
              <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-cyan-400" />
              <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-cyan-400" />
              
              <div className="relative flex flex-col items-center gap-3 text-center">
                <div className="relative">
                  <div className="absolute inset-0 blur-xl bg-blue-400/40" />
                  <div className="relative flex items-center justify-center">
                    <div className="absolute w-14 h-14 sm:w-16 sm:h-16 border border-blue-400/30 rotate-45" />
                    <div className="w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center">
                      <FolderUp className="h-6 w-6 sm:h-7 sm:w-7 text-blue-400" />
                    </div>
                  </div>
                </div>
                <div>
                  <p className="font-bold text-sm sm:text-base text-white uppercase tracking-wide">
                    <span className="hidden sm:inline">{t("dashboard.createFromMaterial")}</span>
                    <span className="sm:hidden">{t("dashboard.createFromMaterialShort")}</span>
                  </p>
                  <p className="text-[10px] sm:text-xs text-neutral-400 mt-1 hidden sm:block">
                    {t("dashboard.createFromMaterialDesc")}
                  </p>
                </div>
              </div>
              <Film className="absolute top-3 right-3 h-4 w-4 text-cyan-400/60" />
            </button>
          </div>

        </div>

        {activeJobs.length > 0 && (
          <div className="space-y-1">
            {activeJobs.map((job) => {
              const isCompleting = completingJobIds.has(job.id);
              const progress = isCompleting ? 100 : Math.max(job.progress || 0, 5);
              return (
                <div 
                  key={job.id} 
                  className={`flex items-center gap-2 px-1 transition-opacity duration-300 ${isCompleting ? 'opacity-0' : 'opacity-100'}`}
                >
                  <div className="flex-1 h-1 bg-neutral-800/50 overflow-hidden rounded-full">
                    <div 
                      className={`h-full rounded-full transition-all duration-300 ease-out ${
                        isCompleting 
                          ? 'bg-green-500' 
                          : 'bg-gradient-to-r from-amber-500 via-orange-400 to-amber-500 bg-[length:200%_100%] animate-[shimmer_1.5s_ease-in-out_infinite]'
                      }`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <span className={`text-[10px] font-medium min-w-[3ch] text-right tabular-nums ${isCompleting ? 'text-green-500' : 'text-neutral-500'}`}>
                    {progress}%
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-3">
          <div className="relative overflow-hidden border border-rose-500/30 bg-neutral-900/90">
            <div className="absolute inset-0 bg-gradient-to-br from-rose-500/10 via-transparent to-amber-500/10" />
            <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-rose-400" />
            <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-rose-400" />
            <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-amber-400" />
            <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-amber-400" />
            
            <div className="relative p-3">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <Scissors className="h-4 w-4 text-rose-400" />
                  <h3 className="text-sm font-semibold text-white uppercase tracking-wide">{t("dashboard.recentTopics")}</h3>
                  <button
                    onClick={handleFetchTopics}
                    disabled={fetchTopicsMutation.isPending || hasPendingFetchTopics}
                    className="p-1 text-rose-400/70 hover:text-rose-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    data-testid="button-refresh-topics"
                    title={t("dashboard.updateTopics")}
                  >
                    {(fetchTopicsMutation.isPending || hasPendingFetchTopics) ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
                <Link href="/topics">
                  <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 text-rose-300 hover:text-rose-200" data-testid="link-view-all-topics">
                    {t("dashboard.viewAll")}
                    <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                </Link>
              </div>
              
              {topicsLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="animate-pulse">
                      <div className="h-3 bg-neutral-800 w-3/4 mb-1" />
                      <div className="h-2 bg-neutral-800 w-1/2" />
                    </div>
                  ))}
                </div>
              ) : recentTopics.length === 0 ? (
                <div className="text-center py-4">
                  <Scissors className="h-8 w-8 text-neutral-600 mx-auto mb-2" />
                  <p className="text-xs text-neutral-400">{t("topics.noTopics")}</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {recentTopics.map((topic) => {
                    const isNewlyAdded = newlyAddedIds.has(topic.id);
                    return (
                    <Link key={topic.id} href={`/topics?highlight=${topic.id}`}>
                      <div
                        className={`group flex items-center gap-2 p-1.5 bg-neutral-800/50 border border-rose-500/20 hover-elevate cursor-pointer transition-all duration-300 ${
                          isNewlyAdded ? "animate-new-item border-emerald-400/30" : ""
                        }`}
                        style={{ borderRadius: '2px' }}
                        data-testid={`topic-item-${topic.id}`}
                      >
                        <div className="relative w-14 h-10 flex-shrink-0 overflow-hidden bg-neutral-900" style={{ borderRadius: '2px' }}>
                          <img
                            src={getTopicImage(topic)}
                            alt=""
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                            onError={() => handleImageError(topic.id)}
                            loading="lazy"
                          />
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent to-neutral-900/30" />
                        </div>
                        
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-[11px] text-neutral-200 truncate group-hover:text-white leading-tight">
                            {language === "en" 
                              ? (topic.translatedTitleEn || topic.generatedTitle || topic.title)
                              : (topic.translatedTitle || topic.generatedTitle || topic.title)}
                          </p>
                          <p className="text-[10px] text-neutral-400 truncate mt-0.5 leading-tight">
                            {topic.insights?.summary || topic.rawText || ""}
                          </p>
                        </div>
                        
                        <ChevronRight className="h-4 w-4 text-neutral-400 group-hover:text-rose-400 flex-shrink-0" />
                      </div>
                    </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="relative overflow-hidden border border-blue-500/30 bg-neutral-900/90">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-transparent to-cyan-500/10" />
            <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-blue-400" />
            <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-blue-400" />
            <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-cyan-400" />
            <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-cyan-400" />
            
            <div className="relative p-3">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <Film className="h-4 w-4 text-blue-400" />
                  <h3 className="text-sm font-semibold text-white uppercase tracking-wide">{t("dashboard.recentScripts")}</h3>
                </div>
                <Link href="/scripts">
                  <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 text-blue-300 hover:text-blue-200" data-testid="link-view-all-scripts">
                    {t("dashboard.viewAll")}
                    <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                </Link>
              </div>
              
              {scriptsLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="animate-pulse">
                      <div className="h-3 bg-neutral-800 w-3/4 mb-1" />
                      <div className="h-2 bg-neutral-800 w-1/2" />
                    </div>
                  ))}
                </div>
              ) : recentScripts.length === 0 ? (
                <div className="text-center py-4">
                  <Film className="h-8 w-8 text-neutral-600 mx-auto mb-2" />
                  <p className="text-xs text-neutral-400">{t("scripts.noScripts")}</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {recentScripts.map((script) => (
                    <Link key={script.id} href={`/script/${script.id}`}>
                      <div
                        className="flex items-center gap-2 p-2 bg-neutral-800/50 border border-blue-500/20 hover-elevate cursor-pointer group"
                        data-testid={`script-item-${script.id}`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-xs text-neutral-200 truncate group-hover:text-white">
                            {script.displayName || script.hook || t("scripts.untitled")}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] text-blue-400 font-medium">{script.durationSec}s</span>
                            <StatusBadge status={script.status} />
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-neutral-400 group-hover:text-blue-400 flex-shrink-0" />
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-neutral-800 dark:border-neutral-800">
          <p className="text-[11px] sm:text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed tracking-wide text-center">
            {t("dashboard.subtitle")}
          </p>
        </div>
      </div>

      <ComingSoonModal open={comingSoonOpen} onOpenChange={setComingSoonOpen} />
    </Layout>
  );
}
