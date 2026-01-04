import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { StatusBadge } from "@/components/status-badge";
import { ScriptStatusSelector } from "@/components/script-status-selector";
import { Skeleton } from "@/components/ui/skeleton";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { 
  ArrowLeft,
  RefreshCw,
  Wand2,
  Download,
  Play,
  Volume2,
  Music,
  FileText,
  Film,
  Loader2,
  ChevronRight,
  Sparkles,
  Clock,
  CheckCircle2,
  AlertCircle,
  Copy,
  Image,
  Camera,
  ImagePlus,
  Pencil,
  Plus,
  List,
  Check,
  X
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Script, Topic, Job, StoryboardScene, Duration, StylePreset, Language, AccentPreset, Platform, VideoFormat } from "@shared/schema";
import { stylePresetLabels, accentLabels, platformLabels, formatLabels } from "@shared/schema";
import { Link } from "wouter";
import { VoiceGenerator } from "@/components/voice-generator";
import { useI18n } from "@/lib/i18n";
import { ChevronDown, ChevronUp } from "lucide-react";

function TopicDescription({ topic, language }: { topic: Topic; language: string }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { t } = useI18n();
  
  const fullTitle = language === "en" 
    ? (topic.translatedTitleEn || topic.generatedTitle || topic.title) 
    : (topic.translatedTitle || topic.generatedTitle || topic.title);
  
  const fullContent = topic.fullContent || "";
  const hasContent = fullContent.length > 0;
  
  return (
    <div className="mt-2">
      <p 
        className="text-sm text-muted-foreground leading-relaxed"
        data-testid="text-topic-description"
      >
        <span className="text-neutral-500">{t("script.topicLabel")}:</span>{" "}
        <span className="text-neutral-300">{fullTitle}</span>
        {!isExpanded && (
          <button
            onClick={() => setIsExpanded(true)}
            className="ml-1 text-rose-400 hover:text-rose-300 transition-colors font-medium"
            data-testid="button-expand-topic"
          >
            ...
          </button>
        )}
      </p>
      
      {isExpanded && (
        <div className="mt-3 p-3 -mx-8 sm:mx-0 px-3 sm:px-3 bg-neutral-800/50 border-y sm:border border-neutral-700/50 text-sm text-neutral-300 leading-relaxed">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            {topic.url ? (
              <a 
                href={topic.url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-[10px] uppercase tracking-wide text-rose-400 hover:text-rose-300 underline"
              >
                {language === "ru" ? "Содержание новости" : "Article Content"}
              </a>
            ) : (
              <span className="text-[10px] uppercase tracking-wide text-neutral-500">
                {language === "ru" ? "Содержание новости" : "Article Content"}
              </span>
            )}
            <button
              onClick={() => setIsExpanded(false)}
              className="flex items-center gap-1 text-xs text-rose-400 hover:text-rose-300 transition-colors ml-auto"
              data-testid="button-collapse-topic"
            >
              <ChevronUp className="h-3 w-3" />
              {t("common.showLess")}
            </button>
          </div>
          {hasContent ? (
            <div className="max-h-40 overflow-y-auto pr-1 content-scrollbar">
              <p className="whitespace-pre-wrap text-xs">{fullContent}</p>
            </div>
          ) : (
            <div className="text-center py-2">
              <p className="text-neutral-500 text-xs">
                {topic.extractionStatus === "extracting" 
                  ? (language === "ru" ? "Загрузка контента..." : "Loading content...")
                  : (language === "ru" ? "Содержание недоступно" : "Content not available")}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ScriptDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { t, language } = useI18n();
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [thesesSource, setThesesSource] = useState<"content" | "web" | null>(null);
  const [isGeneratingTheses, setIsGeneratingTheses] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState("");
  const titleInputRef = useRef<HTMLInputElement>(null);

  const { data: script, isLoading: scriptLoading } = useQuery<Script>({
    queryKey: ["/api/scripts", id],
    enabled: !!id,
  });

  const { data: topic } = useQuery<Topic>({
    queryKey: ["/api/topics", script?.topicId],
    enabled: !!script?.topicId,
  });

  const { data: jobs } = useQuery<Job[]>({
    queryKey: ["/api/jobs"],
    refetchInterval: 2000,
  });

  const scriptJobs = jobs?.filter(
    (j) => j.payload && (j.payload as any).scriptId === id
  ) || [];

  const activeJob = scriptJobs.find((j) => j.status === "running" || j.status === "queued");
  
  // Track previous job statuses to detect completion
  const prevJobsRef = useRef<Map<string, string>>(new Map());
  
  // Watch for job completion and refresh script
  useEffect(() => {
    // Reset ref if no script jobs exist to avoid stale state
    if (scriptJobs.length === 0) {
      prevJobsRef.current = new Map();
      return;
    }
    
    const currentJobs = new Map(scriptJobs.map(j => [j.id, j.status]));
    
    // Check if any job just completed (was running/queued, now done)
    for (const job of scriptJobs) {
      const prevStatus = prevJobsRef.current.get(job.id);
      if (prevStatus && (prevStatus === "running" || prevStatus === "queued") && job.status === "done") {
        // Job just completed - refresh script data
        queryClient.invalidateQueries({ queryKey: ["/api/scripts", id] });
        break;
      }
    }
    
    prevJobsRef.current = currentJobs;
  }, [scriptJobs, id]);

  const updateMutation = useMutation({
    mutationFn: (data: Partial<Script>) => apiRequest("PATCH", `/api/scripts/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scripts", id] });
      setIsEditing(null);
      toast({ title: t("script.scriptUpdated") });
    },
    onError: () => {
      toast({ title: t("common.error"), description: t("script.failedToUpdate"), variant: "destructive" });
    },
  });

  const generateMutation = useMutation({
    mutationFn: (kind: string) =>
      apiRequest("POST", "/api/jobs", { kind, payload: { scriptId: id } }),
    onSuccess: (_, kind) => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      toast({ title: t("script.generationStarted"), description: t(`job.${kind}`) });
    },
    onError: () => {
      toast({ title: t("common.error"), description: t("script.failedToGenerate"), variant: "destructive" });
    },
  });

  const exportMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/scripts/${id}/export`);
      return res.json();
    },
    onSuccess: (data: { downloadUrl?: string }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/scripts", id] });
      if (data?.downloadUrl) {
        window.open(data.downloadUrl, "_blank");
      }
      toast({ title: t("script.exportReady"), description: t("script.exportReadyDesc") });
    },
    onError: () => {
      toast({ title: t("common.error"), description: t("script.failedToExport"), variant: "destructive" });
    },
  });

  const handleEditSave = (field: string) => {
    updateMutation.mutate({ [field]: editValue });
  };

  const startEdit = (field: string, value: string) => {
    setIsEditing(field);
    setEditValue(value || "");
  };

  const startEditTitle = () => {
    const currentTitle = script?.displayName || script?.hook || topic?.title || "";
    setTitleValue(currentTitle);
    setIsEditingTitle(true);
    setTimeout(() => titleInputRef.current?.focus(), 50);
  };

  const saveTitle = () => {
    if (titleValue.trim()) {
      updateMutation.mutate({ displayName: titleValue.trim() });
    }
    setIsEditingTitle(false);
  };

  const cancelEditTitle = () => {
    setIsEditingTitle(false);
    setTitleValue("");
  };

  const handleGenerateTheses = async () => {
    if (!script) return;
    
    setIsGeneratingTheses(true);
    try {
      let theses: string[] = [];
      
      if (thesesSource === null || thesesSource === "content") {
        const content = topic?.fullContent || script.hook || topic?.title || "";
        if (content.length > 50) {
          const res = await apiRequest("POST", "/api/theses/from-content", {
            content,
            language: script.language,
            count: 3
          });
          const data = await res.json();
          theses = data.theses || [];
          setThesesSource("content");
        } else {
          setThesesSource("web");
        }
      }
      
      if (thesesSource === "web" || theses.length === 0) {
        const topicTitle = topic?.generatedTitle || topic?.translatedTitle || topic?.title || script.hook || "";
        const res = await apiRequest("POST", "/api/theses/from-web", {
          topic: topicTitle,
          language: script.language,
          count: 3
        });
        const data = await res.json();
        theses = data.theses || [];
        setThesesSource("web");
      }
      
      if (theses.length > 0) {
        const thesesText = theses.map((t, i) => `- ${t}`).join("\n");
        const currentVoice = script.voiceText || "";
        const newVoiceText = currentVoice 
          ? `${currentVoice}\n\n${script.language === "ru" ? "ТЕЗИСЫ:" : "KEY POINTS:"}\n${thesesText}`
          : `${script.language === "ru" ? "ТЕЗИСЫ:" : "KEY POINTS:"}\n${thesesText}`;
        
        await updateMutation.mutateAsync({ voiceText: newVoiceText });
        toast({ 
          title: thesesSource === "content" 
            ? (script.language === "ru" ? "Тезисы из статьи" : "Theses from article")
            : (script.language === "ru" ? "Трендовые тезисы" : "Trending theses"),
          description: script.language === "ru" 
            ? `Добавлено ${theses.length} тезисов`
            : `Added ${theses.length} theses`
        });
      }
    } catch (error) {
      toast({ 
        title: t("common.error"), 
        description: script.language === "ru" ? "Не удалось сгенерировать тезисы" : "Failed to generate theses",
        variant: "destructive" 
      });
    } finally {
      setIsGeneratingTheses(false);
    }
  };

  const formatSrtTime = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.round((seconds % 1) * 1000);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
  };

  const formatVttTime = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.round((seconds % 1) * 1000);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
  };

  const downloadSubtitles = (format: "srt" | "vtt" | "csv" | "tsv") => {
    if (!script?.storyboard?.length) return;
    
    let content = "";
    let subtitleCount = 0;
    const separator = format === "tsv" ? "\t" : ",";
    
    if (format === "vtt") {
      content = "WEBVTT\n\n";
    } else if (format === "csv" || format === "tsv") {
      content = `start${separator}end${separator}text\n`;
    }
    
    script.storyboard.forEach((scene) => {
      const startTime = scene.startTime ?? 0;
      const endTime = scene.endTime ?? (startTime + parseInt(scene.durationHint?.replace(/[^0-9]/g, '') || '7'));
      
      const text = scene.voText || scene.onScreenText || "";
      if (!text.trim()) return;
      
      subtitleCount++;
      
      if (format === "srt") {
        content += `${subtitleCount}\n`;
        content += `${formatSrtTime(startTime)} --> ${formatSrtTime(endTime)}\n`;
        content += `${text}\n\n`;
      } else if (format === "vtt") {
        content += `${formatVttTime(startTime)} --> ${formatVttTime(endTime)}\n`;
        content += `${text}\n\n`;
      } else {
        const escapedText = text.replace(/"/g, '""');
        content += `${startTime.toFixed(2)}${separator}${endTime.toFixed(2)}${separator}"${escapedText}"\n`;
      }
    });
    
    if (subtitleCount === 0) {
      toast({ 
        title: t("common.error"), 
        description: t("script.noSubtitles"), 
        variant: "destructive" 
      });
      return;
    }
    
    const mimeTypes: Record<string, string> = {
      srt: "text/plain",
      vtt: "text/vtt",
      csv: "text/csv",
      tsv: "text/tab-separated-values"
    };
    
    const blob = new Blob([content], { type: mimeTypes[format] });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `script-${id}.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast({ title: t("copied"), description: `${format.toUpperCase()} ${script.language === "ru" ? "скачан" : "downloaded"}` });
  };

  if (scriptLoading) {
    return (
      <Layout title="Script">
        <div className="p-4 md:p-6 space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-[400px] w-full" />
        </div>
      </Layout>
    );
  }

  if (!script) {
    return (
      <Layout title={t("script.title")}>
        <div className="p-4 md:p-6">
          <Card>
            <CardContent className="py-16 text-center">
              <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h2 className="text-lg font-semibold mb-2">{t("script.notFound")}</h2>
              <p className="text-muted-foreground mb-4">
                {t("script.notFoundDesc")}
              </p>
              <Link href="/scripts">
                <Button>{t("script.backToScripts")}</Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  const completionSteps = [
    { key: "seo", label: t("script.seoTitles") || "SEO", done: !!script.seoTitles?.length },
    { key: "voiceText", label: t("script.voiceScript"), done: !!script.voiceText },
    { key: "storyboard", label: t("script.storyboard"), done: !!script.storyboard?.length },
    { key: "music", label: t("script.music"), done: !!script.music },
  ];

  const completedSteps = completionSteps.filter((s) => s.done).length;
  const completionPercent = (completedSteps / completionSteps.length) * 100;

  return (
    <Layout title={t("script.title")}>
      <div className="p-4 md:p-6 space-y-4 overflow-x-hidden">
        <div className="relative overflow-hidden border border-neutral-700/50 bg-neutral-900/90">
          {/* Film strip decoration - left */}
          <div className="absolute left-0 top-0 bottom-0 w-6 bg-neutral-800/50 flex flex-col justify-around py-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="w-3 h-2 bg-neutral-700/60 mx-auto" />
            ))}
          </div>
          
          {/* Film strip decoration - right */}
          <div className="absolute right-0 top-0 bottom-0 w-6 bg-neutral-800/50 flex flex-col justify-around py-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="w-3 h-2 bg-neutral-700/60 mx-auto" />
            ))}
          </div>
          
          {/* Background grid pattern */}
          <div className="absolute inset-0 opacity-[0.03]" style={{
            backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 20px, rgba(255,255,255,0.1) 20px, rgba(255,255,255,0.1) 21px),
                              repeating-linear-gradient(90deg, transparent, transparent 20px, rgba(255,255,255,0.1) 20px, rgba(255,255,255,0.1) 21px)`
          }} />
          
          {/* Diagonal scan lines */}
          <div className="absolute inset-0 opacity-[0.02]" style={{
            backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255,255,255,0.1) 10px, rgba(255,255,255,0.1) 11px)`
          }} />
          
          {/* Timeline markers - horizontal line */}
          <div className="absolute bottom-0 left-8 right-8 h-[1px] bg-gradient-to-r from-transparent via-neutral-600/30 to-transparent" />
          
          {/* Vertical playhead line */}
          <div className="absolute top-2 bottom-2 left-[15%] w-[1px] bg-rose-500/10" />
          <div className="absolute top-0 left-[15%] w-1 h-1 bg-rose-500/20" />
          
          {/* Focus brackets - decorative camera markers */}
          <div className="absolute top-1/2 left-12 -translate-y-1/2 w-4 h-4 border-l border-t border-neutral-600/20" />
          <div className="absolute top-1/2 right-12 -translate-y-1/2 w-4 h-4 border-r border-b border-neutral-600/20" />
          
          {/* Subtle vignette */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/10 pointer-events-none" />
          
          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-r from-rose-500/5 via-transparent to-amber-500/5" />
          
          {/* REC indicator */}
          <div className="absolute top-1 left-8 flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-rose-500/40 animate-pulse" />
            <span className="text-[8px] font-mono text-neutral-600 tracking-wider">REC</span>
          </div>
          
          {/* Corner markers */}
          <div className="absolute top-0 left-6 w-3 h-3 border-t-2 border-l-2 border-rose-500/60" />
          <div className="absolute top-0 right-6 w-3 h-3 border-t-2 border-r-2 border-rose-500/60" />
          <div className="absolute bottom-0 left-6 w-3 h-3 border-b-2 border-l-2 border-amber-500/60" />
          <div className="absolute bottom-0 right-6 w-3 h-3 border-b-2 border-r-2 border-amber-500/60" />
          
          {/* Timecode decoration */}
          <div className="absolute top-1 right-8 text-[8px] font-mono text-neutral-600 tracking-wider">
            00:00:00:00
          </div>
          
          {/* Back button - mobile: top left corner, desktop: inline */}
          <Link href="/scripts" className="absolute top-2 left-2 z-10 sm:hidden">
            <Button variant="ghost" size="icon" data-testid="button-back-mobile" className="h-8 w-8 bg-neutral-800/80">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          
          <div className="relative p-4 pl-8 pr-8 sm:pl-10 sm:pr-10">
            <div className="flex items-center gap-3">
              <Link href="/scripts" className="hidden sm:block">
                <Button variant="ghost" size="icon" data-testid="button-back" className="flex-shrink-0">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              
              <div className="flex-1 min-w-0">
                {isEditingTitle ? (
                  <div className="flex items-center gap-2">
                    <Input
                      ref={titleInputRef}
                      value={titleValue}
                      onChange={(e) => setTitleValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveTitle();
                        if (e.key === "Escape") cancelEditTitle();
                      }}
                      className="h-9 text-base font-bold bg-background/50 border-primary/30 focus:border-primary"
                      data-testid="input-script-title"
                    />
                    <Button size="icon" variant="ghost" onClick={saveTitle} data-testid="button-save-title">
                      <Check className="h-4 w-4 text-green-500" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={cancelEditTitle} data-testid="button-cancel-title">
                      <X className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 group min-w-0 flex-1">
                      <h1 
                        className="text-base sm:text-xl font-bold truncate cursor-pointer" 
                        data-testid="text-script-title" 
                        title={script.displayName || script.hook || topic?.title || t("scripts.untitled")}
                        onClick={startEditTitle}
                      >
                        {(script.displayName || script.hook || topic?.title || t("scripts.untitled")).slice(0, 50)}
                        {(script.displayName || script.hook || topic?.title || "").length > 50 ? "..." : ""}
                      </h1>
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-7 w-7 opacity-50 group-hover:opacity-100 transition-opacity flex-shrink-0"
                        onClick={startEditTitle}
                        data-testid="button-edit-title"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="flex-shrink-0">
                      <ScriptStatusSelector 
                        status={script.status} 
                        onChange={(newStatus) => updateMutation.mutate({ status: newStatus })}
                        disabled={updateMutation.isPending}
                      />
                    </div>
                  </div>
                )}
                
                {topic && !isEditingTitle && (
                  <TopicDescription topic={topic} language={language} />
                )}
              </div>
            </div>
          </div>
        </div>

        {activeJob && (
          <div className="relative overflow-hidden border border-amber-500/30 bg-neutral-900/90">
            <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 via-transparent to-orange-500/5" />
            <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-amber-400/50" />
            <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-amber-400/50" />
            <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-orange-400/50" />
            <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-orange-400/50" />
            
            <div className="relative p-3">
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-amber-400 flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white uppercase tracking-wide">
                      {t(`job.${activeJob.kind}`) || activeJob.kind.replace(/_/g, " ")}
                    </span>
                    <span className="text-[10px] font-mono text-amber-400">
                      {Math.max(activeJob.progress || 0, activeJob.status === "running" ? 5 : 0)}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-neutral-800 overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-500 ease-out"
                      style={{ width: `${Math.max(activeJob.progress || 0, activeJob.status === "running" ? 5 : 0)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {script.error && (
          <div className="relative border border-red-500/40 bg-neutral-900/80">
            <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-red-500/60" />
            <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-red-500/60" />
            <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-red-500/60" />
            <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-red-500/60" />
            <div className="p-4 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-semibold text-sm text-red-400 uppercase tracking-wide">Error</p>
                <p className="text-sm text-neutral-300 mt-1">{script.error}</p>
              </div>
            </div>
          </div>
        )}

        <div className="relative overflow-hidden border border-neutral-700/50 bg-neutral-900/80">
          {/* Slider track decorations - left side */}
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-rose-500/20 via-amber-500/20 to-rose-500/20" />
          
          {/* Control knob pattern background */}
          <div className="absolute inset-0 opacity-[0.015]" style={{
            backgroundImage: `radial-gradient(circle at 25% 25%, rgba(255,255,255,0.15) 1px, transparent 1px),
                              radial-gradient(circle at 75% 75%, rgba(255,255,255,0.1) 1px, transparent 1px)`,
            backgroundSize: '20px 20px'
          }} />
          
          {/* Horizontal parameter lines */}
          <div className="absolute top-[30%] left-4 right-4 h-[1px] bg-gradient-to-r from-neutral-700/20 via-neutral-600/10 to-neutral-700/20" />
          <div className="absolute top-[70%] left-4 right-4 h-[1px] bg-gradient-to-r from-neutral-700/20 via-neutral-600/10 to-neutral-700/20" />
          
          {/* Corner markers */}
          <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-rose-500/60" />
          <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-rose-500/60" />
          <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-amber-500/60" />
          <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-amber-500/60" />
          
          {/* Settings icon decoration */}
          <div className="absolute top-2 right-3 opacity-10">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-neutral-400">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </div>
          
          <div className="relative px-4 py-3 border-b border-neutral-700/50 bg-neutral-800/50 overflow-hidden">
            {/* Decorative icons in header background */}
            <div className="absolute inset-0 flex items-center justify-end gap-3 pr-4 opacity-[0.06]">
              {/* Sliders icon */}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white">
                <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" />
                <line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" />
                <line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" />
                <circle cx="4" cy="12" r="2" /><circle cx="12" cy="10" r="2" /><circle cx="20" cy="14" r="2" />
              </svg>
              {/* Film icon */}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white">
                <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
                <line x1="7" y1="2" x2="7" y2="22" /><line x1="17" y1="2" x2="17" y2="22" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <line x1="2" y1="7" x2="7" y2="7" /><line x1="2" y1="17" x2="7" y2="17" />
                <line x1="17" y1="17" x2="22" y2="17" /><line x1="17" y1="7" x2="22" y2="7" />
              </svg>
              {/* Monitor/play icon */}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                <line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
                <polygon points="10,8 10,12 14,10" />
              </svg>
              {/* Equalizer bars */}
              <div className="flex items-end gap-0.5 h-5">
                <div className="w-1 h-2 bg-white/80" />
                <div className="w-1 h-4 bg-white/80" />
                <div className="w-1 h-3 bg-white/80" />
                <div className="w-1 h-5 bg-white/80" />
                <div className="w-1 h-2 bg-white/80" />
              </div>
              {/* Timer/clock */}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12,6 12,12 16,14" />
              </svg>
            </div>
            
            <div className="relative flex items-center gap-2">
              <div className="w-1 h-3 bg-gradient-to-b from-rose-500/60 to-amber-500/60" />
              <h3 className="text-sm font-semibold text-white uppercase tracking-wide">{t("script.settings")}</h3>
            </div>
          </div>
          
          <div className="relative p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="space-y-2">
                <Label className="text-[10px] uppercase tracking-wide text-neutral-400">{t("script.format")}</Label>
                <Select
                  value={script.format || "shorts"}
                  onValueChange={(v) => updateMutation.mutate({ format: v as VideoFormat })}
                >
                  <SelectTrigger data-testid="select-format" className="bg-neutral-800 border-neutral-600 h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="shorts">{t("script.formatShorts")}</SelectItem>
                    <SelectItem value="horizontal">{t("script.formatHorizontal")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] uppercase tracking-wide text-neutral-400">{t("script.duration")}</Label>
                <Select
                  value={script.durationSec}
                  onValueChange={(v) => updateMutation.mutate({ durationSec: v as Duration })}
                >
                  <SelectTrigger data-testid="select-duration" className="bg-neutral-800 border-neutral-600 h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">{t("30seconds")}</SelectItem>
                    <SelectItem value="45">{t("45seconds")}</SelectItem>
                    <SelectItem value="60">{t("60seconds")}</SelectItem>
                    <SelectItem value="120">{t("120seconds")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] uppercase tracking-wide text-neutral-400">{t("script.accent")}</Label>
                <Select
                  value={script.accent || "classic"}
                  onValueChange={(v) => updateMutation.mutate({ accent: v as AccentPreset })}
                >
                  <SelectTrigger data-testid="select-accent" className="bg-neutral-800 border-neutral-600 h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(accentLabels).map(([value, labels]) => (
                      <SelectItem key={value} value={value}>{t(`accent.${value}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] uppercase tracking-wide text-neutral-400">{t("script.language")}</Label>
                <Select
                  value={script.language}
                  onValueChange={(v) => updateMutation.mutate({ language: v as Language })}
                >
                  <SelectTrigger data-testid="select-language" className="bg-neutral-800 border-neutral-600 h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ru">{t("common.russian")}</SelectItem>
                    <SelectItem value="en">{t("common.english")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>

        {(script.seo?.seoTitle || script.seo?.hashtags?.length) && (
          <div className="relative border border-neutral-700/50 bg-neutral-900/80">
            <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-rose-500/60" />
            <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-rose-500/60" />
            <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-amber-500/60" />
            <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-amber-500/60" />
            
            <div className="px-4 py-3 border-b border-neutral-700/50 bg-neutral-800/50">
              <h3 className="text-sm font-semibold text-white uppercase tracking-wide">SEO</h3>
            </div>
            
            <div className="p-4 space-y-4">
              {script.seo?.seoTitleOptions && script.seo.seoTitleOptions.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-[10px] uppercase tracking-wide text-neutral-400">{script.language === "ru" ? "Варианты заголовка" : "Title Options"}</Label>
                  <div className="space-y-1">
                    {script.seo.seoTitleOptions.map((title, idx) => (
                      <div 
                        key={idx} 
                        className={`p-2 text-sm cursor-pointer transition-colors border ${
                          script.seo?.seoTitle === title 
                            ? "bg-rose-500/10 border-rose-500/30 text-white" 
                            : "bg-neutral-800/50 border-neutral-700/50 text-neutral-300 hover:bg-neutral-700/50"
                        }`}
                        onClick={() => {
                          if (script.seo) {
                            updateMutation.mutate({ seo: { ...script.seo, seoTitle: title } });
                          }
                        }}
                        data-testid={`seo-title-option-${idx}`}
                      >
                        {title}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {script.seo?.hashtags && script.seo.hashtags.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-[10px] uppercase tracking-wide text-neutral-400">{script.language === "ru" ? "Хештеги" : "Hashtags"}</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(script.seo?.hashtags?.join(" ") || "");
                        toast({ title: t("copied") });
                      }}
                      data-testid="button-copy-hashtags"
                    >
                      <Copy className="h-3 w-3 mr-1" />
                      {t("common.copy")}
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {script.seo.hashtags.map((tag, idx) => (
                      <Badge key={idx} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="relative border border-neutral-700/50 bg-neutral-900/80">
          <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-rose-500/60" />
          <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-rose-500/60" />
          <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-amber-500/60" />
          <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-amber-500/60" />
          
          <div className="px-4 py-3 border-b border-neutral-700/50 bg-neutral-800/50">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-white uppercase tracking-wide">{t("script.productionPipeline")}</h3>
              <Button
                onClick={() => generateMutation.mutate("generate_all")}
                disabled={generateMutation.isPending || !!activeJob}
                data-testid="button-generate-all"
                size="sm"
                className="text-xs sm:text-sm bg-gradient-to-r from-rose-500 to-amber-500 text-white border-0"
              >
                {generateMutation.isPending ? (
                  <Loader2 className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2 animate-spin" />
                ) : (
                  <Sparkles className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                )}
                <span className="hidden sm:inline">{t("script.generateAllButton")}</span>
                <span className="sm:hidden">{t("script.generateAllShort") || "AI"}</span>
              </Button>
            </div>
            <div className="flex items-center gap-2 mt-3">
              <div className="flex-1 h-1.5 bg-neutral-800 overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-rose-500 to-amber-500 transition-all duration-500"
                  style={{ width: `${completionPercent}%` }}
                />
              </div>
              <span className="text-[10px] font-mono text-neutral-400">
                {completedSteps}/{completionSteps.length}
              </span>
            </div>
          </div>
          
          <div className="p-4 space-y-4">
            <div className="space-y-4">
              <div className="border border-neutral-700/50 bg-neutral-800/30 p-4">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-6 h-6 flex items-center justify-center text-xs font-bold ${script.voiceText ? "bg-emerald-500/20 text-emerald-400" : "bg-neutral-700 text-neutral-400"}`}>
                      {script.voiceText ? <CheckCircle2 className="h-4 w-4" /> : "1"}
                    </div>
                    <h3 className="font-semibold text-white text-sm uppercase tracking-wide">
                      <span className="hidden sm:inline">{t("script.voiceScript")}</span>
                      <span className="sm:hidden">{t("script.voiceScriptShort")}</span>
                    </h3>
                  </div>
                  <div className="flex items-center gap-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={handleGenerateTheses}
                          disabled={isGeneratingTheses || generateMutation.isPending || !!activeJob}
                          data-testid="button-generate-theses"
                          className="border-neutral-600 bg-neutral-800"
                        >
                          {isGeneratingTheses ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <List className="h-4 w-4" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {thesesSource === "content" 
                          ? (script.language === "ru" ? "Трендовые тезисы" : "Trending theses")
                          : (script.language === "ru" ? "Тезисы из статьи" : "Theses from article")}
                      </TooltipContent>
                    </Tooltip>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => generateMutation.mutate("generate_script")}
                      disabled={generateMutation.isPending || !!activeJob}
                      data-testid="button-generate-script"
                      className="border-neutral-600 bg-neutral-800"
                    >
                      <Wand2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {isEditing === "voiceText" ? (
                  <div className="space-y-2">
                    <Textarea
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="min-h-[120px] bg-neutral-800 border-neutral-600"
                      data-testid="textarea-voice"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => handleEditSave("voiceText")} data-testid="button-save-voice">
                        {t("common.save")}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setIsEditing(null)} className="border-neutral-600">
                        {t("common.cancel")}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div
                      className="p-3 bg-neutral-800/50 border border-neutral-700/50 min-h-[80px] cursor-pointer hover:bg-neutral-700/50 transition-colors"
                      onClick={() => startEdit("voiceText", script.voiceText || "")}
                      data-testid="voice-content"
                    >
                      {script.voiceText ? (
                        <p className="text-sm whitespace-pre-wrap text-neutral-200">{script.voiceText}</p>
                      ) : (
                        <p className="text-sm text-neutral-500 italic">{t("script.clickToEdit")}</p>
                      )}
                    </div>
                    {script.voiceText && (
                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => startEdit("voiceText", script.voiceText || "")}
                          data-testid="button-edit-voice"
                          className="border-neutral-600"
                        >
                          <Pencil className="h-3 w-3 mr-1" />
                          {t("common.edit")}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <VoiceGenerator
                text={script.voiceText || ""}
                language={script.language as "ru" | "en"}
                stylePreset={script.voiceStylePreset}
              />

              <div className="border border-neutral-700/50 bg-neutral-800/30 p-4">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-6 h-6 flex items-center justify-center text-xs font-bold ${script.storyboard?.length ? "bg-emerald-500/20 text-emerald-400" : "bg-neutral-700 text-neutral-400"}`}>
                      {script.storyboard?.length ? <CheckCircle2 className="h-4 w-4" /> : "2"}
                    </div>
                    <h3 className="font-semibold text-white text-sm uppercase tracking-wide">{t("script.storyboard")}</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    {script.storyboard && script.storyboard.length > 0 && (
                      <>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => downloadSubtitles("srt")}
                              data-testid="button-download-srt"
                              className="border-neutral-600"
                            >
                              <Download className="h-3 w-3 mr-1" />
                              SRT
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{t("script.downloadSrt")}</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => downloadSubtitles("vtt")}
                              data-testid="button-download-vtt"
                              className="border-neutral-600"
                            >
                              <Download className="h-3 w-3 mr-1" />
                              VTT
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{t("script.downloadVtt")}</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => downloadSubtitles("csv")}
                              data-testid="button-download-csv"
                              className="border-neutral-600"
                            >
                              <Download className="h-3 w-3 mr-1" />
                              CSV
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{script.language === "ru" ? "Скачать CSV для Premiere/DaVinci" : "Download CSV for Premiere/DaVinci"}</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => downloadSubtitles("tsv")}
                              data-testid="button-download-tsv"
                              className="border-neutral-600"
                            >
                              <Download className="h-3 w-3 mr-1" />
                              TSV
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{script.language === "ru" ? "Скачать TSV для таблиц" : "Download TSV for spreadsheets"}</TooltipContent>
                        </Tooltip>
                      </>
                    )}
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => generateMutation.mutate("generate_storyboard")}
                      disabled={generateMutation.isPending || !!activeJob}
                      data-testid="button-generate-storyboard"
                      className="border-neutral-600 bg-neutral-800"
                    >
                      <Wand2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {script.storyboard && script.storyboard.length > 0 ? (
                  <>
                    {/* Desktop Table View */}
                    <div className="hidden md:block rounded-md border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-10">#</TableHead>
                            <TableHead className="w-20">{t("script.tableTimecode")}</TableHead>
                            <TableHead className="w-16">{t("script.tablePreview")}</TableHead>
                            <TableHead>{t("script.tableCamera")}</TableHead>
                            <TableHead className="w-12">{t("script.tableStocks")}</TableHead>
                            <TableHead className="w-28 max-w-28">{t("script.tableSubtitles")}</TableHead>
                            <TableHead className="w-12">{t("script.tableDuration")}</TableHead>
                            <TableHead>{t("aiPrompt")}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(() => {
                            let cumulativeTime = 0;
                            return script.storyboard.map((scene, idx) => {
                              const sceneDuration = parseInt(scene.durationHint?.replace(/[^0-9]/g, '') || '7');
                              const startTime = cumulativeTime;
                              cumulativeTime += sceneDuration;
                              const formatTime = (sec: number) => {
                                const m = Math.floor(sec / 60);
                                const s = sec % 60;
                                return `${m}:${s.toString().padStart(2, '0')}`;
                              };
                              const timecode = `${formatTime(startTime)}-${formatTime(cumulativeTime)}`;
                              // Extract keywords from scene content for preview image
                              const extractKeywords = (text: string): string => {
                                // Remove common words and extract meaningful terms
                                const stopWords = ['the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been', 'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'и', 'в', 'на', 'с', 'по', 'за', 'к', 'о', 'об', 'у', 'из', 'от', 'до', 'для', 'это', 'что', 'как', 'но', 'или', 'не', 'он', 'она', 'они', 'его', 'её', 'их', 'мы', 'вы', 'ты', 'я'];
                                const words = text.toLowerCase()
                                  .replace(/[^\w\sа-яА-ЯёЁ]/g, ' ')
                                  .split(/\s+/)
                                  .filter(w => w.length > 2 && !stopWords.includes(w));
                                return words.slice(0, 3).join(',');
                              };
                              
                              // Priority: aiPrompt → onScreenText → stockKeywords → visual
                              const contentSource = scene.aiPrompt || scene.onScreenText || scene.stockKeywords?.join(' ') || scene.visual || '';
                              const stockQuery = extractKeywords(contentSource);
                              const stockPreviewUrl = stockQuery 
                                ? `https://loremflickr.com/80/60/${encodeURIComponent(stockQuery)}`
                                : null;
                              
                              return (
                                <TableRow key={idx}>
                                  <TableCell className="font-medium text-muted-foreground">{scene.sceneNumber}</TableCell>
                                  <TableCell className="text-xs font-mono text-muted-foreground">{timecode}</TableCell>
                                  <TableCell className="p-1">
                                    {stockPreviewUrl ? (
                                      <div className="w-14 h-10 rounded overflow-hidden bg-muted">
                                        <img 
                                          src={stockPreviewUrl} 
                                          alt={scene.visual || "Scene preview"}
                                          className="w-full h-full object-cover"
                                          loading="lazy"
                                        />
                                      </div>
                                    ) : (
                                      <div className="w-14 h-10 rounded bg-muted flex items-center justify-center">
                                        <ImagePlus className="w-4 h-4 text-muted-foreground" />
                                      </div>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-sm">{scene.visual}</TableCell>
                                  <TableCell className="text-sm">
                                    {scene.stockKeywords && scene.stockKeywords.length > 0 ? (
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button
                                            size="icon"
                                            variant="ghost"
                                            className="h-8 w-8"
                                            data-testid={`button-copy-stock-${idx}`}
                                            onClick={() => {
                                              navigator.clipboard.writeText(scene.stockKeywords?.join(', ') || '');
                                              toast({
                                                title: t("copied"),
                                                description: t("script.keywordsCopied"),
                                              });
                                            }}
                                          >
                                            <Copy className="w-4 h-4" />
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent side="top" className="max-w-xs">
                                          <p className="text-xs">{scene.stockKeywords?.join(', ')}</p>
                                        </TooltipContent>
                                      </Tooltip>
                                    ) : (
                                      <span className="text-muted-foreground">-</span>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-sm max-w-28">
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="block truncate cursor-default text-xs">
                                          {scene.onScreenText || '-'}
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent side="top" className="max-w-xs">
                                        <p className="text-xs">{scene.onScreenText}</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TableCell>
                                  <TableCell className="text-xs text-muted-foreground font-mono">{scene.durationHint || `${sceneDuration}s`}</TableCell>
                                  <TableCell className="text-sm">
                                    {scene.aiPrompt ? (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        data-testid={`button-copy-ai-prompt-${idx}`}
                                        onClick={() => {
                                          navigator.clipboard.writeText(scene.aiPrompt || "");
                                          toast({
                                            title: t("copied"),
                                            description: t("aiPromptCopied"),
                                          });
                                        }}
                                      >
                                        <Copy className="w-3 h-3 mr-1" />
                                        {t("copyPrompt")}
                                      </Button>
                                    ) : (
                                      <span className="text-muted-foreground italic">-</span>
                                    )}
                                  </TableCell>
                                </TableRow>
                              );
                            });
                          })()}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Mobile Card View */}
                    <div className="md:hidden space-y-3">
                      {(() => {
                        let cumulativeTime = 0;
                        return script.storyboard.map((scene, idx) => {
                          const sceneDuration = parseInt(scene.durationHint?.replace(/[^0-9]/g, '') || '7');
                          const startTime = cumulativeTime;
                          cumulativeTime += sceneDuration;
                          const formatTime = (sec: number) => {
                            const m = Math.floor(sec / 60);
                            const s = sec % 60;
                            return `${m}:${s.toString().padStart(2, '0')}`;
                          };
                          const timecode = `${formatTime(startTime)}-${formatTime(cumulativeTime)}`;
                          // Extract keywords from scene content for preview image
                          const extractKeywords = (text: string): string => {
                            // Remove common words and extract meaningful terms
                            const stopWords = ['the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been', 'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'и', 'в', 'на', 'с', 'по', 'за', 'к', 'о', 'об', 'у', 'из', 'от', 'до', 'для', 'это', 'что', 'как', 'но', 'или', 'не', 'он', 'она', 'они', 'его', 'её', 'их', 'мы', 'вы', 'ты', 'я'];
                            const words = text.toLowerCase()
                              .replace(/[^\w\sа-яА-ЯёЁ]/g, ' ')
                              .split(/\s+/)
                              .filter(w => w.length > 2 && !stopWords.includes(w));
                            return words.slice(0, 3).join(',');
                          };
                          
                          // Priority: aiPrompt → onScreenText → stockKeywords → visual
                          const contentSource = scene.aiPrompt || scene.onScreenText || scene.stockKeywords?.join(' ') || scene.visual || '';
                          const stockQuery = extractKeywords(contentSource);
                          const stockPreviewUrl = stockQuery 
                            ? `https://loremflickr.com/400/300/${encodeURIComponent(stockQuery)}`
                            : null;
                          
                          return (
                            <div 
                              key={idx} 
                              className="relative rounded-lg overflow-hidden min-h-[120px]" 
                              data-testid={`card-scene-${idx}`}
                            >
                              {/* Background image */}
                              {stockPreviewUrl && (
                                <img 
                                  src={stockPreviewUrl}
                                  alt={scene.visual || "Scene preview"}
                                  className="absolute inset-0 w-full h-full object-cover"
                                  loading="lazy"
                                />
                              )}
                              {/* Semi-transparent overlay for text readability */}
                              <div className={`absolute inset-0 ${stockPreviewUrl ? 'bg-black/50' : 'bg-muted'}`} />
                              
                              {/* Content */}
                              <div className="relative z-10 p-3">
                                <div className="flex items-center justify-between mb-2">
                                  <Badge variant="secondary" className="text-xs font-mono bg-background/80 backdrop-blur-sm">
                                    #{scene.sceneNumber} / {scene.durationHint || `${sceneDuration}s`}
                                  </Badge>
                                  <span className="text-xs font-mono px-1.5 py-0.5 rounded text-white/90 bg-black/40">
                                    {timecode}
                                  </span>
                                </div>
                                
                                {/* Camera/Visual */}
                                <p className="text-sm font-medium line-clamp-2 text-white" title={scene.visual}>
                                  {scene.visual}
                                </p>
                                
                                {/* Subtitles - Clickable on mobile */}
                                {scene.onScreenText && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-auto p-1 mt-2 text-left justify-start w-full text-white/90 hover:bg-white/10"
                                    data-testid={`button-subtitle-${idx}`}
                                    onClick={() => {
                                      navigator.clipboard.writeText(scene.onScreenText || '');
                                      toast({
                                        title: t("copied"),
                                        description: scene.onScreenText,
                                      });
                                    }}
                                  >
                                    <div className="flex items-center gap-1 text-xs">
                                      <Copy className="w-3 h-3 flex-shrink-0" />
                                      <span className="line-clamp-2">{scene.onScreenText}</span>
                                    </div>
                                  </Button>
                                )}
                                
                                {/* Stock Keywords - shown as chips on mobile */}
                                {scene.stockKeywords && scene.stockKeywords.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-white/20">
                                    {scene.stockKeywords.map((kw, kwIdx) => (
                                      <Badge 
                                        key={kwIdx} 
                                        variant="secondary" 
                                        className="text-xs cursor-pointer bg-white/20 text-white hover:bg-white/30"
                                        onClick={() => {
                                          navigator.clipboard.writeText(kw);
                                          toast({
                                            title: t("copied"),
                                            description: `"${kw}" ${t("script.keywordsCopied")}`,
                                          });
                                        }}
                                      >
                                        {kw}
                                      </Badge>
                                    ))}
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="text-xs h-6 px-2 text-white/90 hover:bg-white/10"
                                      data-testid={`button-mobile-copy-stock-${idx}`}
                                      onClick={() => {
                                        navigator.clipboard.writeText(scene.stockKeywords?.join(', ') || '');
                                        toast({
                                          title: t("copied"),
                                          description: t("script.keywordsCopied"),
                                        });
                                      }}
                                    >
                                      <Copy className="w-3 h-3" />
                                    </Button>
                                  </div>
                                )}
                                
                                {/* AI Prompt button */}
                                {scene.aiPrompt && (
                                  <div className="flex gap-2 mt-2 pt-2 border-t border-white/20">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="text-xs border-white/40 text-white hover:bg-white/10"
                                      data-testid={`button-mobile-copy-ai-prompt-${idx}`}
                                      onClick={() => {
                                        navigator.clipboard.writeText(scene.aiPrompt || "");
                                        toast({
                                          title: t("copied"),
                                          description: t("aiPromptCopied"),
                                        });
                                      }}
                                    >
                                      <Copy className="w-3 h-3 mr-1" />
                                      {t("aiPrompt")}
                                    </Button>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </>
                ) : (
                  <div className="p-6 bg-neutral-800/50 border border-neutral-700/50 text-center">
                    <Film className="h-8 w-8 mx-auto text-neutral-500 mb-2" />
                    <p className="text-sm text-neutral-400">
                      {t("script.noStoryboard")}
                    </p>
                  </div>
                )}
              </div>

              <div className="border border-neutral-700/50 bg-neutral-800/30 p-4">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-6 h-6 flex items-center justify-center text-xs font-bold ${script.music ? "bg-emerald-500/20 text-emerald-400" : "bg-neutral-700 text-neutral-400"}`}>
                      {script.music ? <CheckCircle2 className="h-4 w-4" /> : "3"}
                    </div>
                    <h3 className="font-semibold text-white text-sm uppercase tracking-wide">{t("script.music")}</h3>
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => generateMutation.mutate("pick_music")}
                    disabled={generateMutation.isPending || !!activeJob}
                    data-testid="button-generate-music"
                    className="border-neutral-600 bg-neutral-800"
                  >
                    <Music className="h-4 w-4" />
                  </Button>
                </div>
                {script.music ? (
                  <div className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="p-3 bg-neutral-800/50 border border-neutral-700/50">
                        <p className="text-[10px] uppercase tracking-wide text-neutral-400 mb-1">Mood</p>
                        <p className="font-medium text-white">{script.music.mood}</p>
                      </div>
                      <div className="p-3 bg-neutral-800/50 border border-neutral-700/50">
                        <p className="text-[10px] uppercase tracking-wide text-neutral-400 mb-1">BPM</p>
                        <p className="font-medium text-white">{script.music.bpm}</p>
                      </div>
                      <div className="p-3 bg-neutral-800/50 border border-neutral-700/50">
                        <p className="text-[10px] uppercase tracking-wide text-neutral-400 mb-1">Genre</p>
                        <p className="font-medium text-white">{script.music.genre}</p>
                      </div>
                      <div className="p-3 bg-neutral-800/50 border border-neutral-700/50">
                        <p className="text-[10px] uppercase tracking-wide text-neutral-400 mb-1">License</p>
                        <p className="font-medium text-sm text-neutral-200">{script.music.licenseNote}</p>
                      </div>
                    </div>
                    {script.music.freeTrackSuggestions && script.music.freeTrackSuggestions.length > 0 && (
                      <div className="border border-neutral-700/50 p-3">
                        <p className="text-[10px] uppercase tracking-wide text-neutral-400 mb-2 font-medium">Free Track Suggestions</p>
                        <div className="space-y-2">
                          {script.music.freeTrackSuggestions.map((track, idx) => (
                            <div key={idx} className="flex items-center justify-between p-2 bg-neutral-800/50 border border-neutral-700/50">
                              <div>
                                <p className="font-medium text-sm text-white">{track.name}</p>
                                <p className="text-xs text-neutral-400">{track.artist} - {track.source}</p>
                              </div>
                              {track.url && (
                                <a href={track.url} target="_blank" rel="noopener noreferrer">
                                  <Button size="sm" variant="outline" data-testid={`button-music-link-${idx}`} className="border-neutral-600">
                                    Open
                                  </Button>
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-6 bg-neutral-800/50 border border-neutral-700/50 text-center">
                    <Music className="h-8 w-8 mx-auto text-neutral-500 mb-2" />
                    <p className="text-sm text-neutral-400">
                      No music suggestions yet. Click "Pick Music" to get recommendations.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* SEO TITLES BLOCK */}
        <div className="relative border border-neutral-700/50 bg-neutral-900/80">
          <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-rose-500/60" />
          <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-rose-500/60" />
          <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-amber-500/60" />
          <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-amber-500/60" />
          
          <div className="px-4 py-3 border-b border-neutral-700/50 bg-neutral-800/50 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className={`w-6 h-6 flex items-center justify-center text-xs font-bold ${script.seoTitles?.length ? "bg-emerald-500/20 text-emerald-400" : "bg-neutral-700 text-neutral-400"}`}>
                {script.seoTitles?.length ? <CheckCircle2 className="h-4 w-4" /> : "4"}
              </div>
              <h3 className="text-sm font-semibold text-white uppercase tracking-wide">
                {script.language === "ru" ? "SEO Заголовки" : "SEO Titles"}
              </h3>
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => generateMutation.mutate("generate_hook")}
              disabled={generateMutation.isPending || !!activeJob}
              data-testid="button-generate-seo"
              className="border-neutral-600 bg-neutral-800"
            >
              <Wand2 className="h-4 w-4" />
            </Button>
          </div>
          
          <div className="p-4 space-y-4">
            {/* 3 SEO Title Variants */}
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-wide text-neutral-400 font-medium">
                {script.language === "ru" ? "Варианты заголовков" : "Title Variants"}
              </p>
              {script.seoTitles?.length ? (
                <div className="space-y-2">
                  {script.seoTitles.map((title, idx) => (
                    <div 
                      key={idx}
                      className="group relative p-3 bg-neutral-800/50 border border-neutral-700/50 hover:border-rose-500/30 transition-colors cursor-pointer"
                      onClick={() => {
                        navigator.clipboard.writeText(title);
                        toast({
                          title: t("copied"),
                          description: script.language === "ru" ? "Заголовок скопирован" : "Title copied",
                        });
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-[10px] font-bold bg-gradient-to-br from-rose-500/20 to-amber-500/20 text-rose-400">
                          {idx + 1}
                        </span>
                        <p className="text-sm text-neutral-200 flex-1 break-words">{title}</p>
                        <Copy className="h-4 w-4 text-neutral-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : script.hook ? (
                <div className="p-3 bg-neutral-800/50 border border-neutral-700/50">
                  <p className="text-sm text-neutral-200">{script.hook}</p>
                  <p className="text-xs text-neutral-500 mt-2 italic">
                    {script.language === "ru" ? "Нажмите генерацию для 3 вариантов" : "Click generate for 3 variants"}
                  </p>
                </div>
              ) : (
                <div className="p-4 bg-neutral-800/50 border border-neutral-700/50 text-center">
                  <FileText className="h-6 w-6 mx-auto text-neutral-500 mb-2" />
                  <p className="text-sm text-neutral-400">
                    {script.language === "ru" ? "Нажмите для генерации SEO заголовков" : "Click to generate SEO titles"}
                  </p>
                </div>
              )}
            </div>

            {/* Video Description */}
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-wide text-neutral-400 font-medium">
                {script.language === "ru" ? "Описание видео" : "Video Description"}
              </p>
              {isEditing === "videoDescription" ? (
                <div className="space-y-2">
                  <Textarea
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    className="min-h-[100px] bg-neutral-800 border-neutral-600 text-sm"
                    placeholder={script.language === "ru" ? "Краткое описание о чём это видео..." : "Brief description of what this video is about..."}
                    data-testid="textarea-video-description"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => handleEditSave("videoDescription")} data-testid="button-save-description">
                      {t("common.save")}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setIsEditing(null)} className="border-neutral-600">
                      {t("common.cancel")}
                    </Button>
                  </div>
                </div>
              ) : (
                <div
                  className="p-3 bg-neutral-800/50 border border-neutral-700/50 min-h-[80px] cursor-pointer hover:bg-neutral-700/50 transition-colors"
                  onClick={() => startEdit("videoDescription", script.videoDescription || "")}
                  data-testid="video-description-content"
                >
                  {script.videoDescription ? (
                    <p className="text-sm whitespace-pre-wrap text-neutral-200 break-words">{script.videoDescription}</p>
                  ) : (
                    <p className="text-sm text-neutral-500 italic">
                      {script.language === "ru" 
                        ? "Нажмите чтобы добавить описание видео для YouTube/TikTok..." 
                        : "Click to add video description for YouTube/TikTok..."}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="relative border border-neutral-700/50 bg-neutral-900/80">
          <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-rose-500/60" />
          <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-rose-500/60" />
          <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-amber-500/60" />
          <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-amber-500/60" />
          
          <div className="px-4 py-3 border-b border-neutral-700/50 bg-neutral-800/50">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wide">Export Package</h3>
            <p className="text-xs text-neutral-400 mt-1">Download all assets as a ZIP file for video production</p>
          </div>
          
          <div className="p-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <Button
                onClick={() => exportMutation.mutate()}
                disabled={exportMutation.isPending || completedSteps === 0}
                className="flex-1 sm:flex-none bg-gradient-to-r from-rose-500 to-amber-500 text-white border-0"
                data-testid="button-export"
              >
                {exportMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                Export ZIP Package
              </Button>
              {script.assets?.exportZip && (
                <a href={script.assets.exportZip} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" data-testid="button-download" className="border-neutral-600">
                    <Download className="h-4 w-4 mr-2" />
                    Download Last Export
                  </Button>
                </a>
              )}
            </div>
          </div>
        </div>

        {scriptJobs.length > 0 && (
          <div className="relative border border-neutral-700/50 bg-neutral-900/80">
            <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-rose-500/60" />
            <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-rose-500/60" />
            <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-amber-500/60" />
            <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-amber-500/60" />
            
            <div className="px-4 py-3 border-b border-neutral-700/50 bg-neutral-800/50">
              <h3 className="text-sm font-semibold text-white uppercase tracking-wide">Recent Jobs</h3>
            </div>
            
            <div className="p-4 space-y-2">
              {scriptJobs.slice(0, 5).map((job) => (
                <div
                  key={job.id}
                  className="flex items-center justify-between p-3 bg-neutral-800/50 border border-neutral-700/50"
                >
                  <div className="flex items-center gap-3">
                    {job.status === "running" ? (
                      <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
                    ) : job.status === "done" ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    ) : job.status === "error" ? (
                      <AlertCircle className="h-4 w-4 text-red-400" />
                    ) : (
                      <Clock className="h-4 w-4 text-neutral-400" />
                    )}
                    <span className="text-sm font-medium capitalize text-neutral-200">
                      {job.kind.replace(/_/g, " ")}
                    </span>
                  </div>
                  <StatusBadge status={job.status} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
