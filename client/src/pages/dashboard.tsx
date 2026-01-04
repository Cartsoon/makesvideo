import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
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
  ChevronRight
} from "lucide-react";
import type { Topic, Script, Job } from "@shared/schema";
import { ComingSoonModal } from "@/components/coming-soon-modal";

export default function Dashboard() {
  const { toast } = useToast();
  const { t, language } = useI18n();
  const [comingSoonOpen, setComingSoonOpen] = useState(false);
  const [processedJobIds, setProcessedJobIds] = useState<Set<string>>(new Set());
  
  const [prevTopicIds, setPrevTopicIds] = useState<Set<string>>(new Set());
  const [newlyAddedIds, setNewlyAddedIds] = useState<Set<string>>(new Set());

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
    const newlyCompletedJobs = fetchTopicsJobs.filter(j => !processedJobIds.has(j.id));
    
    if (newlyCompletedJobs.length > 0) {
      queryClient.invalidateQueries({ queryKey: ["/api/topics"] });
      queryClient.invalidateQueries({ queryKey: ["/api/scripts"] });
      setProcessedJobIds(prev => {
        const next = new Set(prev);
        newlyCompletedJobs.forEach(j => next.add(j.id));
        return next;
      });
    }
  }, [jobs, processedJobIds]);

  const activeJobs = jobs?.filter(j => j.status === "running" || j.status === "queued") || [];
  const hasPendingFetchTopics = activeJobs.some(j => j.kind === "fetch_topics");

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

  // Filter only "new" status topics and take top 6
  const newTopics = topics?.filter(t => t.status === "new") || [];
  const recentTopics = newTopics
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 6);
  const recentScripts = scripts?.slice(0, 4) || [];

  // Track newly added topics for animation
  useEffect(() => {
    if (!newTopics.length) return;
    
    const currentIds = new Set(newTopics.map(t => t.id));
    
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
  }, [newTopics]);

  const stats = {
    totalTopics: topics?.length || 0,
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
            <button
              onClick={handleFetchTopics}
              disabled={fetchTopicsMutation.isPending || hasPendingFetchTopics}
              className="relative overflow-hidden px-4 py-2.5 sm:px-5 sm:py-3 bg-gradient-to-r from-rose-500 to-amber-500 text-white font-semibold text-sm uppercase tracking-wide hover-elevate active-elevate-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 w-full sm:w-auto flex-shrink-0"
              data-testid="button-fetch-topics"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-rose-600 to-amber-600 opacity-0 hover:opacity-100 transition-opacity" />
              <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-white/30" />
              <div className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-white/30" />
              <div className="absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-white/30" />
              <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-white/30" />
              <span className="relative flex items-center gap-2">
                {(fetchTopicsMutation.isPending || hasPendingFetchTopics) ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                {t("dashboard.updateTopics")}
              </span>
            </button>
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
            <Link href="/text-to-video">
            <button
              className="group relative overflow-hidden p-4 sm:p-5 border border-rose-500/30 bg-neutral-900/90 dark:bg-neutral-900/90 hover-elevate active-elevate-2 transition-all cursor-pointer w-full"
              data-testid="button-create-from-text"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-rose-500/20 via-transparent to-amber-500/20 opacity-60" />
              
              <div className="absolute -right-4 -bottom-4 opacity-[0.04]">
                <Type className="w-24 h-24 sm:w-32 sm:h-32" />
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
              
              <div className="relative flex flex-col items-center gap-3 text-center">
                <div className="relative">
                  <div className="absolute inset-0 blur-xl bg-rose-400/40" />
                  <div className="relative flex items-center justify-center">
                    <div className="absolute w-14 h-14 sm:w-16 sm:h-16 border border-rose-400/30 rotate-45" />
                    <div className="w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center">
                      <Type className="h-6 w-6 sm:h-7 sm:w-7 text-rose-400" />
                    </div>
                  </div>
                </div>
                <div>
                  <p className="font-bold text-sm sm:text-base text-white uppercase tracking-wide">
                    <span className="hidden sm:inline">{t("dashboard.createFromText")}</span>
                    <span className="sm:hidden">{t("dashboard.createFromTextShort")}</span>
                  </p>
                  <p className="text-[10px] sm:text-xs text-neutral-400 mt-1 hidden sm:block">
                    {t("dashboard.createFromTextDesc")}
                  </p>
                </div>
              </div>
              <Sparkles className="absolute top-3 right-3 h-4 w-4 text-amber-400/60" />
            </button>
            </Link>

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
          <div className="relative overflow-hidden border border-amber-500/30 bg-neutral-900/90">
            <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 via-transparent to-orange-500/5" />
            <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-amber-400/50" />
            <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-amber-400/50" />
            <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-orange-400/50" />
            <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-orange-400/50" />
            
            <div className="relative p-3 space-y-3">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
                <h3 className="text-sm font-semibold text-white uppercase tracking-wide">
                  {t("dashboard.activeJobs")}
                </h3>
              </div>
              
              <div className="space-y-2">
                {activeJobs.map((job) => {
                  const progress = Math.max(job.progress || 0, job.status === "running" ? 5 : 0);
                  return (
                    <div key={job.id} className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-neutral-300">
                          {t(`job.${job.kind}`) || job.kind.replace(/_/g, " ")}
                        </span>
                        <span className="text-[10px] font-mono text-amber-400">{progress}%</span>
                      </div>
                      <div className="h-1.5 bg-neutral-800 overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-500 ease-out"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
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
                    <Link key={topic.id} href="/topics">
                      <div
                        className={`flex items-center gap-2 p-2 bg-neutral-800/50 border border-rose-500/20 hover-elevate cursor-pointer group transition-all duration-500 ${
                          isNewlyAdded ? "animate-pulse ring-2 ring-rose-400/50 bg-rose-900/20" : ""
                        }`}
                        data-testid={`topic-item-${topic.id}`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-xs text-neutral-200 truncate group-hover:text-white">
                            {language === "en" 
                              ? (topic.translatedTitleEn || topic.generatedTitle || topic.title)
                              : (topic.translatedTitle || topic.generatedTitle || topic.title)}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] text-rose-400 font-medium">{topic.score}</span>
                            <StatusBadge status={topic.status} />
                          </div>
                        </div>
                        <ChevronRight className="h-3 w-3 text-neutral-500 group-hover:text-rose-400 flex-shrink-0" />
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
                        <ChevronRight className="h-3 w-3 text-neutral-500 group-hover:text-blue-400 flex-shrink-0" />
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
