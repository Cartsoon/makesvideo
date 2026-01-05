import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ListSkeleton } from "@/components/loading-skeleton";
import { EmptyState } from "@/components/empty-state";
import { SourcePresets } from "@/components/source-presets";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Rss, MessageCircle, Link as LinkIcon, Edit2, Trash2, Loader2, RefreshCw, CheckCircle2, XCircle, AlertCircle, Code, FileText, Youtube, Search, TrendingUp, Activity, Zap } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Source, SourceType, SourceHealthStatus, CategoryId } from "@shared/schema";
import { categoryLabels, sourceHealthLabels, sourceTypeLabels } from "@shared/schema";

const sourceTypeIcons: Record<SourceType, typeof Rss> = {
  rss: Rss,
  telegram: MessageCircle,
  telegram_channel: MessageCircle,
  url: LinkIcon,
  manual: Edit2,
  api: Code,
  html: FileText,
  reddit_rss: Rss,
  youtube_api: Youtube,
  youtube_channel: Youtube,
  youtube_channel_rss: Youtube,
  youtube_search: Search,
  youtube_trending: TrendingUp,
  x_user: MessageCircle,
};

const healthStatusIcons: Record<SourceHealthStatus, typeof CheckCircle2> = {
  ok: CheckCircle2,
  warning: AlertCircle,
  dead: XCircle,
  pending: RefreshCw,
};

const healthStatusColors: Record<SourceHealthStatus, string> = {
  ok: "text-green-500",
  warning: "text-yellow-500",
  dead: "text-red-500",
  pending: "text-muted-foreground",
};

type HealthStatus = { healthy: boolean; error?: string; itemCount: number };

export default function Sources() {
  const { toast } = useToast();
  const { t, language } = useI18n();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<Source | null>(null);
  const [healthStatus, setHealthStatus] = useState<Record<string, HealthStatus>>({});
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);
  const [formData, setFormData] = useState({
    type: "rss" as SourceType,
    name: "",
    url: "",
    description: "",
  });

  const { data: sources, isLoading } = useQuery<Source[]>({
    queryKey: ["/api/sources"],
  });

  const createMutation = useMutation({
    mutationFn: (data: { type: SourceType; name: string; config: { url?: string; description?: string }; isEnabled: boolean }) =>
      apiRequest("POST", "/api/sources", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sources"] });
      setIsDialogOpen(false);
      resetForm();
      toast({ title: t("sources.created"), description: t("sources.createdDesc") });
    },
    onError: () => {
      toast({ title: t("common.error"), description: t("sources.createError"), variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; config?: { url?: string; description?: string }; isEnabled?: boolean }) =>
      apiRequest("PATCH", `/api/sources/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sources"] });
      setIsDialogOpen(false);
      setEditingSource(null);
      resetForm();
      toast({ title: t("sources.updated"), description: t("sources.updatedDesc") });
    },
    onError: () => {
      toast({ title: t("common.error"), description: t("sources.updateError"), variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/sources/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sources"] });
      toast({ title: t("sources.deleted"), description: t("sources.deletedDesc") });
    },
    onError: () => {
      toast({ title: t("common.error"), description: t("sources.deleteError"), variant: "destructive" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isEnabled }: { id: string; isEnabled: boolean }) =>
      apiRequest("PATCH", `/api/sources/${id}`, { isEnabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sources"] });
    },
  });

  const resetForm = () => {
    setFormData({ type: "rss", name: "", url: "", description: "" });
  };

  const handleEdit = (source: Source) => {
    setEditingSource(source);
    setFormData({
      type: source.type,
      name: source.name,
      url: source.config.url || "",
      description: source.config.description || "",
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    const config = {
      url: formData.url || undefined,
      description: formData.description || undefined,
    };

    if (editingSource) {
      updateMutation.mutate({ id: editingSource.id, name: formData.name, config });
    } else {
      createMutation.mutate({ type: formData.type, name: formData.name, config, isEnabled: true });
    }
  };

  const handleDialogClose = () => {
    setIsDialogOpen(false);
    setEditingSource(null);
    resetForm();
  };

  const [checkingSourceId, setCheckingSourceId] = useState<string | null>(null);

  const checkAllHealth = async () => {
    if (!sources || sources.length === 0) return;
    setIsCheckingHealth(true);
    try {
      const response = await apiRequest("POST", "/api/sources/check-all");
      const results = await response.json();
      setHealthStatus(results);
      
      const healthyCount = Object.values(results as Record<string, HealthStatus>).filter(s => s.healthy).length;
      const unhealthyCount = Object.values(results as Record<string, HealthStatus>).filter(s => !s.healthy).length;
      
      toast({
        title: language === "ru" ? "Проверка завершена" : "Check complete",
        description: language === "ru" 
          ? `Работает: ${healthyCount}, Не работает: ${unhealthyCount}`
          : `Working: ${healthyCount}, Not working: ${unhealthyCount}`,
      });
    } catch (error) {
      toast({
        title: t("common.error"),
        description: language === "ru" ? "Не удалось проверить источники" : "Failed to check sources",
        variant: "destructive",
      });
    } finally {
      setIsCheckingHealth(false);
    }
  };

  const checkSingleHealth = async (sourceId: string, sourceName: string) => {
    setCheckingSourceId(sourceId);
    try {
      const response = await apiRequest("POST", `/api/sources/${sourceId}/check`);
      const result = await response.json();
      setHealthStatus(prev => ({ ...prev, [sourceId]: result }));
      queryClient.invalidateQueries({ queryKey: ["/api/sources"] });
      
      toast({
        title: result.healthy 
          ? (language === "ru" ? "Источник работает" : "Source is working")
          : (language === "ru" ? "Источник недоступен" : "Source unavailable"),
        description: result.healthy 
          ? `${sourceName}: ${result.itemCount} ${language === "ru" ? "элементов" : "items"}`
          : result.error || sourceName,
        variant: result.healthy ? "default" : "destructive",
      });
    } catch (error) {
      toast({
        title: t("common.error"),
        description: language === "ru" ? "Не удалось проверить источник" : "Failed to check source",
        variant: "destructive",
      });
    } finally {
      setCheckingSourceId(null);
    }
  };

  const getHealthIcon = (sourceId: string) => {
    const status = healthStatus[sourceId];
    if (!status) return null;
    
    if (status.healthy) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
          </TooltipTrigger>
          <TooltipContent>
            <p>{status.itemCount} {language === "ru" ? "элементов" : "items"}</p>
          </TooltipContent>
        </Tooltip>
      );
    }
    
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
        </TooltipTrigger>
        <TooltipContent>
          <p>{status.error || (language === "ru" ? "Ошибка" : "Error")}</p>
        </TooltipContent>
      </Tooltip>
    );
  };

  return (
    <Layout title={t("nav.sources")}>
      <div className="p-3 md:p-4 space-y-3 overflow-x-hidden">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <div className="w-1 h-6 bg-gradient-to-b from-cyan-500 to-blue-500" />
              <h1 className="text-lg sm:text-2xl font-bold text-white uppercase tracking-wide" data-testid="text-page-title">
                {t("sources.title")}
              </h1>
            </div>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            {sources && sources.length > 0 && (
              <button 
                onClick={checkAllHealth}
                disabled={isCheckingHealth}
                className="relative overflow-hidden px-3 py-2 sm:px-4 sm:py-2.5 border border-neutral-600 bg-neutral-800/80 text-neutral-200 font-medium text-xs uppercase tracking-wide hover-elevate active-elevate-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                data-testid="button-check-health"
              >
                <div className="absolute top-0 left-0 w-1.5 h-1.5 border-t border-l border-neutral-500" />
                <div className="absolute top-0 right-0 w-1.5 h-1.5 border-t border-r border-neutral-500" />
                <div className="absolute bottom-0 left-0 w-1.5 h-1.5 border-b border-l border-neutral-500" />
                <div className="absolute bottom-0 right-0 w-1.5 h-1.5 border-b border-r border-neutral-500" />
                {isCheckingHealth ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                <span className="hidden sm:inline">
                  {language === "ru" ? "Проверить" : "Check"}
                </span>
              </button>
            )}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <button 
                  className="relative overflow-hidden px-4 py-2 sm:px-5 sm:py-2.5 bg-gradient-to-r from-rose-500 to-amber-500 text-white font-semibold text-xs uppercase tracking-wide hover-elevate active-elevate-2 flex items-center justify-center gap-2 flex-1 sm:flex-none"
                  data-testid="button-add-source"
                >
                  <div className="absolute top-0 left-0 w-1.5 h-1.5 border-t border-l border-white/30" />
                  <div className="absolute top-0 right-0 w-1.5 h-1.5 border-t border-r border-white/30" />
                  <div className="absolute bottom-0 left-0 w-1.5 h-1.5 border-b border-l border-white/30" />
                  <div className="absolute bottom-0 right-0 w-1.5 h-1.5 border-b border-r border-white/30" />
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">{language === "ru" ? "Добавить вручную" : "Add manually"}</span>
                  <span className="sm:hidden">+</span>
                </button>
              </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{editingSource ? t("sources.editSource") : t("sources.addNewSource")}</DialogTitle>
                <DialogDescription>
                  {t("sources.dialogDesc")}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="type">{t("sources.type")}</Label>
                  <Select
                    value={formData.type}
                    onValueChange={(value) => setFormData({ ...formData, type: value as SourceType })}
                    disabled={!!editingSource}
                  >
                    <SelectTrigger data-testid="select-source-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="rss">{t("sources.rss")}</SelectItem>
                      <SelectItem value="telegram">{t("sources.telegram")}</SelectItem>
                      <SelectItem value="url">{t("sources.urlSource")}</SelectItem>
                      <SelectItem value="manual">{t("sources.manual")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name">{t("sources.name")}</Label>
                  <Input
                    id="name"
                    placeholder={t("sources.namePlaceholder")}
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    data-testid="input-source-name"
                  />
                </div>
                {(formData.type === "rss" || formData.type === "telegram" || formData.type === "url") && (
                  <div className="space-y-2">
                    <Label htmlFor="url">{t("sources.url")}</Label>
                    <Input
                      id="url"
                      placeholder={
                        formData.type === "telegram"
                          ? "https://rsshub.app/telegram/channel/..."
                          : "https://example.com/feed.xml"
                      }
                      value={formData.url}
                      onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                      data-testid="input-source-url"
                    />
                    {formData.type === "telegram" && (
                      <p className="text-xs text-muted-foreground">
                        {t("sources.telegramHint")}
                      </p>
                    )}
                  </div>
                )}
                {formData.type === "manual" && (
                  <div className="space-y-2">
                    <Label htmlFor="description">{t("sources.description")}</Label>
                    <Textarea
                      id="description"
                      placeholder={t("sources.descriptionPlaceholder")}
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      data-testid="input-source-description"
                    />
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={handleDialogClose} data-testid="button-cancel">
                  {t("common.cancel")}
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={!formData.name || createMutation.isPending || updateMutation.isPending}
                  data-testid="button-save-source"
                >
                  {(createMutation.isPending || updateMutation.isPending) && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  {editingSource ? t("common.save") : t("sources.addSource")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          </div>
        </div>

        <SourcePresets />

        {isLoading ? (
          <ListSkeleton count={3} />
        ) : !sources || sources.length === 0 ? (
          <EmptyState
            icon={Rss}
            title={t("sources.noSources")}
            description={t("sources.addFirstSource")}
            action={{
              label: t("sources.addSource"),
              onClick: () => setIsDialogOpen(true),
            }}
          />
        ) : (
          <div className="relative overflow-hidden border border-neutral-700/50 bg-neutral-900/90">
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 via-transparent to-blue-500/5" />
            <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-cyan-400/50" />
            <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-cyan-400/50" />
            <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-blue-400/50" />
            <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-blue-400/50" />
            
            <div className="relative divide-y divide-neutral-800">
              {sources.map((source, index) => {
                const Icon = sourceTypeIcons[source.type] || Rss;
                const HealthIcon = source.health?.status ? healthStatusIcons[source.health.status] : RefreshCw;
                const healthColor = source.health?.status ? healthStatusColors[source.health.status] : "text-muted-foreground";
                const categoryLabel = source.categoryId ? (categoryLabels[source.categoryId as CategoryId]?.[language] || source.categoryId) : null;
                const healthLabel = source.health?.status ? sourceHealthLabels[source.health.status]?.[language] : null;
                
                return (
                  <div 
                    key={source.id} 
                    className="relative p-3 sm:p-4 hover:bg-neutral-800/30 transition-colors"
                    data-testid={`source-card-${source.id}`}
                  >
                    <div className="flex items-start sm:items-center gap-3">
                      <span className="text-neutral-600 text-xs font-mono w-5 flex-shrink-0">{index + 1}.</span>
                      <div className="flex items-center justify-center w-8 h-8 bg-neutral-800 border border-neutral-700 flex-shrink-0">
                        <Icon className="h-4 w-4 text-cyan-400" />
                      </div>
                      <div className="flex-1 min-w-0 overflow-hidden">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                onClick={() => checkSingleHealth(source.id, source.name)}
                                disabled={checkingSourceId === source.id}
                                className="p-0.5 hover:bg-neutral-700/50 rounded transition-colors disabled:opacity-50"
                                data-testid={`button-check-health-${source.id}`}
                              >
                                {checkingSourceId === source.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-400" />
                                ) : (
                                  <HealthIcon className={`h-3.5 w-3.5 flex-shrink-0 ${healthColor} hover:text-cyan-400 transition-colors`} />
                                )}
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="font-medium">{language === "ru" ? "Нажмите для проверки" : "Click to check"}</p>
                              <p className="text-xs text-muted-foreground">{healthLabel || (language === "ru" ? "Не проверен" : "Not checked")}</p>
                              {source.health?.lastError && <p className="text-xs text-red-500">{source.health.lastError}</p>}
                              {source.health?.itemCount ? <p className="text-xs">{source.health.itemCount} {language === "ru" ? "элементов" : "items"}</p> : null}
                              {source.health?.avgLatencyMs ? <p className="text-xs">{source.health.avgLatencyMs}ms</p> : null}
                            </TooltipContent>
                          </Tooltip>
                          <h3 className="font-semibold text-sm text-neutral-100 truncate max-w-[150px] sm:max-w-none">{source.name}</h3>
                          {categoryLabel && (
                            <Badge variant="secondary" className="text-[10px] h-5 px-1.5 bg-neutral-800 text-neutral-300 border-neutral-700">
                              {categoryLabel}
                            </Badge>
                          )}
                          {source.priority > 3 && (
                            <Zap className="h-3 w-3 text-amber-400 flex-shrink-0" />
                          )}
                        </div>
                        {source.config.url && (
                          <p className="text-[11px] text-neutral-500 truncate mt-0.5 font-mono">
                            {source.config.url}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                        <Badge 
                          variant="outline" 
                          className={`text-[10px] h-5 px-1.5 border-neutral-700 ${source.isEnabled ? 'text-emerald-400 bg-emerald-950/30' : 'text-neutral-500 bg-neutral-900'}`}
                        >
                          {source.isEnabled ? (language === "ru" ? "Вкл" : "On") : (language === "ru" ? "Выкл" : "Off")}
                        </Badge>
                        <Switch
                          checked={source.isEnabled}
                          onCheckedChange={(checked) =>
                            toggleMutation.mutate({ id: source.id, isEnabled: checked })
                          }
                          data-testid={`switch-source-${source.id}`}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-neutral-400 hover:text-white"
                          onClick={() => handleEdit(source)}
                          data-testid={`button-edit-${source.id}`}
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-neutral-400 hover:text-red-400"
                          onClick={() => deleteMutation.mutate(source.id)}
                          disabled={deleteMutation.isPending}
                          data-testid={`button-delete-${source.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
