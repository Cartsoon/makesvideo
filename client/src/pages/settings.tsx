import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  Save, 
  Check, 
  Loader2,
  Settings as SettingsIcon,
  Zap,
  Lightbulb,
  BookOpen,
  Sparkles,
  Key,
  ExternalLink,
  CheckCircle2,
  RefreshCw,
  Server,
  Cloud,
  ChevronDown,
  ChevronRight,
  Film,
  Sliders,
  Cpu,
  GraduationCap,
  Play
} from "lucide-react";
import { useTipsVisibility } from "@/components/tips-bar";
import { useAdminAccess } from "@/lib/admin-access";
import type { Setting, Duration, StylePreset } from "@shared/schema";
import { stylePresetLabels } from "@shared/schema";

type ApiProviderType = "default" | "free" | "replit" | "custom";

interface ProviderInfo {
  type: ApiProviderType;
  available: boolean;
  reason?: string;
}

interface AIStatus {
  available: boolean;
  providerType: ApiProviderType;
  providerName: string;
  providerNameEn: string;
  verified: boolean;
  lastVerified?: string;
  fallbackMode: boolean;
  model: string;
  providers: ProviderInfo[];
}

interface SettingsData {
  defaultDuration: Duration;
  defaultStylePreset: StylePreset;
  fallbackMode: boolean;
}

const defaultSettings: SettingsData = {
  defaultDuration: "30",
  defaultStylePreset: "cinematic",
  fallbackMode: false,
};

const providerDescriptions: Record<ApiProviderType, { name: { ru: string; en: string }; desc: { ru: string; en: string }; icon: typeof Server }> = {
  default: {
    name: { ru: "IDENGINE API", en: "IDENGINE API" },
    desc: { ru: "Основной провайдер генерации", en: "Primary generation provider" },
    icon: Server
  },
  free: {
    name: { ru: "Free API", en: "Free API" },
    desc: { ru: "OpenRouter, Together.ai, Groq", en: "OpenRouter, Together.ai, Groq" },
    icon: Sparkles
  },
  replit: {
    name: { ru: "Replit AI", en: "Replit AI" },
    desc: { ru: "Встроенная интеграция", en: "Built-in integration" },
    icon: Cloud
  },
  custom: {
    name: { ru: "Custom API", en: "Custom API" },
    desc: { ru: "OpenAI-совместимый endpoint", en: "OpenAI-compatible endpoint" },
    icon: Key
  }
};

const freeApiLinks = [
  { name: "OpenRouter", url: "https://openrouter.ai/", note: { ru: "Бесплатные модели", en: "Free models" } },
  { name: "Together.ai", url: "https://together.ai/", note: { ru: "Free tier", en: "Free tier" } },
  { name: "Groq", url: "https://groq.com/", note: { ru: "Быстрый API", en: "Fast API" } },
];

function SectionHeader({ icon: Icon, title, subtitle }: { icon: typeof Film; title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="p-2 rounded-md bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <div>
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}

function SettingsCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative bg-card border rounded-md overflow-hidden ${className}`}>
      <div className="absolute top-0 left-0 w-3 h-3 border-l-2 border-t-2 border-primary/40" />
      <div className="absolute top-0 right-0 w-3 h-3 border-r-2 border-t-2 border-primary/40" />
      <div className="absolute bottom-0 left-0 w-3 h-3 border-l-2 border-b-2 border-primary/40" />
      <div className="absolute bottom-0 right-0 w-3 h-3 border-r-2 border-b-2 border-primary/40" />
      <div className="p-4">{children}</div>
    </div>
  );
}

export default function Settings() {
  const { toast } = useToast();
  const { t, language } = useI18n();
  const { isUnlocked } = useAdminAccess();
  const [settings, setSettings] = useState<SettingsData>(defaultSettings);
  const [isVerifying, setIsVerifying] = useState(false);
  const { isHidden: tipsHidden, isDisabled: tipsDisabled, showTips, setTipsDisabled } = useTipsVisibility();
  
  const [expandedProvider, setExpandedProvider] = useState<ApiProviderType | null>(null);
  const [freeApiKey, setFreeApiKey] = useState("");
  const [freeBaseUrl, setFreeBaseUrl] = useState("https://openrouter.ai/api/v1");
  const [customApiKey, setCustomApiKey] = useState("");
  const [customBaseUrl, setCustomBaseUrl] = useState("https://api.openai.com/v1");
  const [isSavingCredentials, setIsSavingCredentials] = useState(false);

  const handleShowOnboarding = () => {
    localStorage.removeItem("idengine-onboarding-complete");
    toast({ 
      title: language === "ru" ? "Онбординг сброшен" : "Onboarding reset", 
      description: language === "ru" ? "Обновите страницу" : "Refresh the page"
    });
  };

  const handleToggleTips = (enabled: boolean) => {
    setTipsDisabled(!enabled);
    toast({ 
      title: enabled 
        ? (language === "ru" ? "Подсказки включены" : "Tips enabled")
        : (language === "ru" ? "Подсказки выключены" : "Tips disabled"),
    });
  };

  const { data: savedSettings, isLoading } = useQuery<Setting[]>({
    queryKey: ["/api/settings"],
  });

  const { data: aiStatus, refetch: refetchAiStatus } = useQuery<AIStatus>({
    queryKey: ["/api/ai/status"],
  });

  useEffect(() => {
    if (savedSettings) {
      const settingsMap = new Map(savedSettings.map((s) => [s.key, s.value]));
      setSettings({
        defaultDuration: (settingsMap.get("defaultDuration") as Duration) || "30",
        defaultStylePreset: (settingsMap.get("defaultStylePreset") as StylePreset) || "cinematic",
        fallbackMode: settingsMap.get("fallbackMode") === "true",
      });
    }
  }, [savedSettings]);

  const saveMutation = useMutation({
    mutationFn: (data: SettingsData) => apiRequest("POST", "/api/settings", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ai/status"] });
      toast({ title: t("settings.saved"), description: t("settings.savedDesc") });
    },
    onError: () => {
      toast({ title: t("common.error"), description: t("settings.saveError"), variant: "destructive" });
    },
  });

  const switchProviderMutation = useMutation({
    mutationFn: (providerType: ApiProviderType) => 
      apiRequest("POST", "/api/ai/provider", { providerType }),
    onSuccess: (_, providerType) => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ 
        title: language === "ru" ? "Провайдер активирован" : "Provider activated",
        description: providerDescriptions[providerType]?.name[language === "ru" ? "ru" : "en"],
        duration: 3000
      });
    },
    onError: (error: any) => {
      toast({ 
        title: t("common.error"), 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const handleVerifyApi = async () => {
    if (!aiStatus?.providerType) return;
    
    setIsVerifying(true);
    try {
      const response = await apiRequest("POST", "/api/ai/verify", { 
        providerType: aiStatus.providerType 
      });
      const result = await response.json();
      
      if (result.success) {
        toast({ 
          title: language === "ru" ? "API подключен" : "API connected",
          description: `${result.model} — ${result.responseTime}ms`,
          duration: 5000
        });
      } else {
        toast({ 
          title: language === "ru" ? "Ошибка" : "Error",
          description: result.error,
          variant: "destructive"
        });
      }
      
      refetchAiStatus();
    } catch (error: any) {
      toast({ 
        title: t("common.error"), 
        description: error.message,
        variant: "destructive" 
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSave = () => {
    saveMutation.mutate(settings);
  };

  const handleSaveCredentials = async (providerType: ApiProviderType, apiKey: string, baseUrl?: string) => {
    if (!apiKey.trim()) {
      toast({ 
        title: language === "ru" ? "Введите API ключ" : "Enter API key",
        variant: "destructive" 
      });
      return;
    }
    
    setIsSavingCredentials(true);
    try {
      const response = await apiRequest("POST", "/api/ai/credentials", {
        providerType,
        apiKey: apiKey.trim(),
        baseUrl: baseUrl?.trim() || undefined
      });
      const result = await response.json();
      
      if (result.success) {
        toast({ 
          title: language === "ru" ? "API подключен" : "API connected",
          description: `${result.model} — ${result.responseTime}ms`,
          duration: 5000
        });
        setExpandedProvider(null);
        queryClient.invalidateQueries({ queryKey: ["/api/ai/status"] });
        queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      } else {
        toast({ 
          title: language === "ru" ? "Ошибка подключения" : "Connection error",
          description: result.error,
          variant: "destructive"
        });
      }
    } catch (error: any) {
      toast({ 
        title: t("common.error"), 
        description: error.message,
        variant: "destructive" 
      });
    } finally {
      setIsSavingCredentials(false);
    }
  };

  if (isLoading) {
    return (
      <Layout title={t("nav.settings")}>
        <div className="h-full flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  const activeProvider = aiStatus?.providers?.find(p => p.type === aiStatus.providerType);

  return (
    <Layout title={t("nav.settings")}>
      <div className="h-full overflow-auto">
        <div className="p-4 md:p-6 lg:p-8 space-y-8 max-w-6xl mx-auto">
          
          {/* Page Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-md bg-gradient-to-br from-primary to-primary/60 text-primary-foreground">
                <SettingsIcon className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight" data-testid="text-page-title">
                  {t("settings.title")}
                </h1>
                <p className="text-sm text-muted-foreground">{t("settings.subtitle")}</p>
              </div>
            </div>
            <Button
              onClick={handleSave}
              disabled={saveMutation.isPending}
              className="gap-2"
              data-testid="button-save-settings"
            >
              {saveMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {t("settings.save")}
            </Button>
          </div>

          {/* Main Grid Layout */}
          <div className="grid lg:grid-cols-2 gap-6">
            
            {/* LEFT COLUMN */}
            <div className="space-y-6">
              
              {/* AI Provider Section */}
              <section>
                <SectionHeader 
                  icon={Cpu} 
                  title={language === "ru" ? "AI Провайдер" : "AI Provider"}
                  subtitle={language === "ru" ? "Источник генерации контента" : "Content generation source"}
                />
                
                <SettingsCard>
                  {/* Status Banner */}
                  {aiStatus?.verified && activeProvider?.available ? (
                    <div className="flex items-center gap-3 p-3 mb-4 rounded-md bg-emerald-500/10 border border-emerald-500/20">
                      <CheckCircle2 className="h-5 w-5 text-emerald-500 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400 truncate">
                          {language === "ru" ? aiStatus.providerName : aiStatus.providerNameEn}
                        </p>
                        <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70">
                          {language === "ru" ? "Подключен" : "Connected"} 
                          {aiStatus.model && ` — ${aiStatus.model}`}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleVerifyApi}
                        disabled={isVerifying}
                        className="flex-shrink-0"
                        data-testid="button-verify-api"
                      >
                        {isVerifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 p-3 mb-4 rounded-md bg-amber-500/10 border border-amber-500/20">
                      <Zap className="h-5 w-5 text-amber-500 flex-shrink-0" />
                      <p className="text-sm text-amber-700 dark:text-amber-400">
                        {language === "ru" ? "Выберите провайдер для генерации" : "Select a provider for generation"}
                      </p>
                    </div>
                  )}

                  {/* Provider List */}
                  <div className="space-y-2">
                    {(["default", "replit", "free", "custom"] as ApiProviderType[]).map((type) => {
                      const provider = aiStatus?.providers?.find(p => p.type === type);
                      const isActive = aiStatus?.providerType === type;
                      const desc = providerDescriptions[type];
                      const IconComponent = desc.icon;
                      const isExpanded = expandedProvider === type;
                      const needsConfig = !provider?.available && (type === "free" || type === "custom");
                      
                      return (
                        <div
                          key={type}
                          className={`rounded-md border transition-all ${
                            isActive 
                              ? "border-primary bg-primary/5 ring-1 ring-primary/20" 
                              : provider?.available 
                                ? "hover-elevate cursor-pointer" 
                                : needsConfig 
                                  ? "cursor-pointer" 
                                  : "opacity-50"
                          }`}
                          data-testid={`provider-option-${type}`}
                        >
                          <div 
                            className="flex items-center gap-3 p-3"
                            onClick={() => {
                              if (switchProviderMutation.isPending) return;
                              if (provider?.available && !isActive) {
                                switchProviderMutation.mutate(type);
                              } else if (needsConfig) {
                                setExpandedProvider(isExpanded ? null : type);
                              }
                            }}
                          >
                            <div className={`p-1.5 rounded ${isActive ? "bg-primary/20" : "bg-muted"}`}>
                              <IconComponent className={`h-4 w-4 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`text-sm font-medium ${isActive ? "text-primary" : ""}`}>
                                  {language === "ru" ? desc.name.ru : desc.name.en}
                                </span>
                                {isActive && (
                                  <Badge variant="default" className="text-[10px] h-4 px-1.5">
                                    {language === "ru" ? "АКТИВЕН" : "ACTIVE"}
                                  </Badge>
                                )}
                                {!provider?.available && !needsConfig && (
                                  <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                                    {language === "ru" ? "НЕДОСТУПЕН" : "UNAVAILABLE"}
                                  </Badge>
                                )}
                                {needsConfig && (
                                  <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                                    {language === "ru" ? "НАСТРОИТЬ" : "CONFIGURE"}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {language === "ru" ? desc.desc.ru : desc.desc.en}
                              </p>
                            </div>
                            {isActive && provider?.available && (
                              <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0" />
                            )}
                            {needsConfig && (
                              isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                            {switchProviderMutation.isPending && switchProviderMutation.variables === type && (
                              <Loader2 className="h-4 w-4 animate-spin text-primary" />
                            )}
                          </div>
                          
                          {/* Expanded Config for Free API */}
                          {type === "free" && isExpanded && (
                            <div className="px-3 pb-3 space-y-3 border-t pt-3 bg-muted/30">
                              <div className="flex flex-wrap gap-2">
                                {freeApiLinks.map((link) => (
                                  <a 
                                    key={link.name} 
                                    href={link.url} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-background border hover-elevate"
                                  >
                                    <ExternalLink className="h-3 w-3" />
                                    <span>{link.name}</span>
                                  </a>
                                ))}
                              </div>
                              <div className="space-y-2">
                                <Input 
                                  type="password" 
                                  placeholder="API Key (sk-...)" 
                                  value={freeApiKey} 
                                  onChange={(e) => setFreeApiKey(e.target.value)}
                                  className="h-9 text-sm"
                                  data-testid="input-free-api-key"
                                />
                                <Input 
                                  type="text" 
                                  placeholder="Base URL (optional)" 
                                  value={freeBaseUrl} 
                                  onChange={(e) => setFreeBaseUrl(e.target.value)}
                                  className="h-9 text-sm"
                                  data-testid="input-free-base-url"
                                />
                                <Button 
                                  className="w-full h-9 gap-2" 
                                  disabled={!freeApiKey.trim() || isSavingCredentials}
                                  onClick={() => handleSaveCredentials("free", freeApiKey, freeBaseUrl)}
                                  data-testid="button-save-free-api"
                                >
                                  {isSavingCredentials ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                                  {language === "ru" ? "Подключить" : "Connect"}
                                </Button>
                              </div>
                            </div>
                          )}
                          
                          {/* Expanded Config for Custom API */}
                          {type === "custom" && isExpanded && (
                            <div className="px-3 pb-3 space-y-3 border-t pt-3 bg-muted/30">
                              <div className="space-y-2">
                                <Input 
                                  type="password" 
                                  placeholder="API Key (sk-...)" 
                                  value={customApiKey} 
                                  onChange={(e) => setCustomApiKey(e.target.value)}
                                  className="h-9 text-sm"
                                  data-testid="input-custom-api-key"
                                />
                                <Input 
                                  type="text" 
                                  placeholder="Base URL (https://api.openai.com/v1)" 
                                  value={customBaseUrl} 
                                  onChange={(e) => setCustomBaseUrl(e.target.value)}
                                  className="h-9 text-sm"
                                  data-testid="input-custom-base-url"
                                />
                                <Button 
                                  className="w-full h-9 gap-2" 
                                  disabled={!customApiKey.trim() || isSavingCredentials}
                                  onClick={() => handleSaveCredentials("custom", customApiKey, customBaseUrl)}
                                  data-testid="button-save-custom-api"
                                >
                                  {isSavingCredentials ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                                  {language === "ru" ? "Подключить" : "Connect"}
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Fallback Mode */}
                  <div className="flex items-center justify-between mt-4 pt-4 border-t">
                    <div>
                      <p className="text-sm font-medium">{t("settings.fallbackMode")}</p>
                      <p className="text-xs text-muted-foreground">{t("settings.fallbackModeDesc")}</p>
                    </div>
                    <Switch
                      checked={settings.fallbackMode}
                      onCheckedChange={(checked) => setSettings({ ...settings, fallbackMode: checked })}
                      data-testid="switch-fallback"
                    />
                  </div>
                </SettingsCard>
              </section>
            </div>

            {/* RIGHT COLUMN */}
            <div className="space-y-6">
              
              {/* Default Settings Section */}
              <section>
                <SectionHeader 
                  icon={Sliders} 
                  title={t("settings.defaults")}
                  subtitle={t("settings.defaultsDesc")}
                />
                
                <SettingsCard>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">{t("settings.defaultDuration")}</Label>
                      <Select
                        value={settings.defaultDuration}
                        onValueChange={(v) => setSettings({ ...settings, defaultDuration: v as Duration })}
                      >
                        <SelectTrigger className="h-10" data-testid="select-default-duration">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="30">30 {t("script.seconds")}</SelectItem>
                          <SelectItem value="45">45 {t("script.seconds")}</SelectItem>
                          <SelectItem value="60">60 {t("script.seconds")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm font-medium">{t("settings.defaultStyle")}</Label>
                      <Select
                        value={settings.defaultStylePreset}
                        onValueChange={(v) => setSettings({ ...settings, defaultStylePreset: v as StylePreset })}
                      >
                        <SelectTrigger className="h-10" data-testid="select-default-style">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(stylePresetLabels).map(([value, label]) => (
                            <SelectItem key={value} value={value}>{t(`style.${value}`) || label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </SettingsCard>
              </section>

              {/* Learning & Tips Section */}
              <section>
                <SectionHeader 
                  icon={GraduationCap} 
                  title={language === "ru" ? "Обучение" : "Learning"}
                  subtitle={language === "ru" ? "Подсказки и туториалы" : "Tips & tutorials"}
                />
                
                <SettingsCard>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-1.5 rounded bg-amber-500/10">
                        <Lightbulb className="h-4 w-4 text-amber-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">
                          {language === "ru" ? "Подсказки" : "Tips"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {language === "ru" ? "Советы по работе" : "Usage hints"}
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={!tipsDisabled}
                      onCheckedChange={handleToggleTips}
                      data-testid="switch-tips-enabled"
                    />
                  </div>
                  
                  <Button
                    variant="outline"
                    onClick={handleShowOnboarding}
                    className="w-full gap-2"
                    data-testid="button-show-onboarding"
                  >
                    <BookOpen className="h-4 w-4" />
                    {language === "ru" ? "Показать онбординг" : "Show onboarding"}
                  </Button>
                </SettingsCard>
              </section>

            </div>
          </div>

          {/* Mobile Save Button */}
          <div className="lg:hidden pt-4">
            <Button
              onClick={handleSave}
              disabled={saveMutation.isPending}
              className="w-full gap-2"
              data-testid="button-save-settings-mobile"
            >
              {saveMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {t("settings.save")}
            </Button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
