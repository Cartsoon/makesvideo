import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
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
  AlertTriangle,
  ExternalLink,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Server,
  Cloud
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
    name: { ru: "IDENGINE Базовый API", en: "IDENGINE Base API" },
    desc: { ru: "Стандартный провайдер. Ключ настраивается через OPENAI_API_KEY.", en: "Default provider. Key configured via OPENAI_API_KEY." },
    icon: Server
  },
  free: {
    name: { ru: "Бесплатный API", en: "Free API" },
    desc: { ru: "OpenRouter Free, Together.ai, Groq. Ключ через FREE_API_KEY.", en: "OpenRouter Free, Together.ai, Groq. Key via FREE_API_KEY." },
    icon: Sparkles
  },
  replit: {
    name: { ru: "Replit AI", en: "Replit AI" },
    desc: { ru: "Встроенный Replit AI. Автоматическая настройка.", en: "Built-in Replit AI. Automatic setup." },
    icon: Cloud
  },
  custom: {
    name: { ru: "Свой API", en: "Custom API" },
    desc: { ru: "OpenAI-совместимый API. Ключ через CUSTOM_OPENAI_API_KEY.", en: "OpenAI-compatible API. Key via CUSTOM_OPENAI_API_KEY." },
    icon: Key
  }
};

const freeApiLinks = [
  { name: "OpenRouter", url: "https://openrouter.ai/", note: { ru: "Есть бесплатные модели", en: "Has free models" } },
  { name: "Together.ai", url: "https://together.ai/", note: { ru: "Free tier включен", en: "Free tier included" } },
  { name: "Groq", url: "https://groq.com/", note: { ru: "Бесплатный API", en: "Free API" } },
];

export default function Settings() {
  const { toast } = useToast();
  const { t, language } = useI18n();
  const { isUnlocked } = useAdminAccess();
  const [settings, setSettings] = useState<SettingsData>(defaultSettings);
  const [isVerifying, setIsVerifying] = useState(false);
  const { isHidden: tipsHidden, isDisabled: tipsDisabled, showTips, setTipsDisabled } = useTipsVisibility();

  const handleShowOnboarding = () => {
    localStorage.removeItem("idengine-onboarding-complete");
    toast({ 
      title: language === "ru" ? "Онбординг сброшен" : "Onboarding reset", 
      description: language === "ru" ? "Обновите страницу, чтобы увидеть онбординг снова." : "Refresh the page to see onboarding again."
    });
  };

  const handleToggleTips = (enabled: boolean) => {
    setTipsDisabled(!enabled);
    toast({ 
      title: enabled 
        ? (language === "ru" ? "Подсказки включены" : "Tips enabled")
        : (language === "ru" ? "Подсказки отключены" : "Tips disabled"),
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
        title: language === "ru" ? "Провайдер переключен" : "Provider switched",
        description: language === "ru" 
          ? `Активный провайдер: ${providerDescriptions[providerType]?.name.ru}`
          : `Active provider: ${providerDescriptions[providerType]?.name.en}`
      });
    },
    onError: (error: any) => {
      toast({ 
        title: t("common.error"), 
        description: error.message || (language === "ru" ? "Не удалось переключить провайдер" : "Failed to switch provider"),
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
          description: language === "ru" 
            ? `Модель: ${result.model}, время отклика: ${result.responseTime}ms`
            : `Model: ${result.model}, response time: ${result.responseTime}ms`
        });
      } else {
        toast({ 
          title: language === "ru" ? "Ошибка подключения" : "Connection error",
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

  if (isLoading) {
    return (
      <Layout title={t("nav.settings")}>
        <div className="p-4 md:p-6 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </Layout>
    );
  }

  const activeProvider = aiStatus?.providers?.find(p => p.type === aiStatus.providerType);

  return (
    <Layout title={t("nav.settings")}>
      <div className="p-4 md:p-6 space-y-6 max-w-2xl">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold" data-testid="text-page-title">{t("settings.title")}</h1>
          <p className="text-muted-foreground text-sm">
            {t("settings.subtitle")}
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-4 w-4" />
              {language === "ru" ? "AI Провайдер" : "AI Provider"}
            </CardTitle>
            <CardDescription>
              {language === "ru" 
                ? "Выберите источник AI для генерации контента"
                : "Choose AI source for content generation"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {aiStatus?.verified && activeProvider?.available ? (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-200">
                <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
                <div className="flex-1 text-sm">
                  <span className="font-medium">
                    {language === "ru" ? aiStatus.providerName : aiStatus.providerNameEn}
                  </span>
                  {aiStatus.lastVerified && (
                    <span className="text-emerald-600 dark:text-emerald-400 ml-2 text-xs">
                      {language === "ru" ? "Проверен" : "Verified"}: {new Date(aiStatus.lastVerified).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleVerifyApi}
                  disabled={isVerifying}
                  data-testid="button-verify-api"
                >
                  {isVerifying ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                </Button>
              </div>
            ) : activeProvider?.available ? (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200">
                <AlertTriangle className="h-5 w-5 flex-shrink-0" />
                <div className="flex-1 text-sm">
                  <span className="font-medium">
                    {language === "ru" ? "Требуется проверка" : "Verification required"}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleVerifyApi}
                  disabled={isVerifying}
                  data-testid="button-verify-api"
                >
                  {isVerifying ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Check className="h-4 w-4 mr-2" />
                  )}
                  {language === "ru" ? "Проверить" : "Verify"}
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200">
                <XCircle className="h-5 w-5 flex-shrink-0" />
                <div className="flex-1 text-sm">
                  <span className="font-medium">
                    {language === "ru" ? "API не настроен" : "API not configured"}
                  </span>
                  <p className="text-xs mt-0.5 text-red-600 dark:text-red-400">
                    {activeProvider?.reason || (language === "ru" ? "Добавьте ключ в Secrets" : "Add key in Secrets")}
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-2">
              {(["default", "free", "replit", "custom"] as ApiProviderType[]).map((type) => {
                const provider = aiStatus?.providers?.find(p => p.type === type);
                const isActive = aiStatus?.providerType === type;
                const desc = providerDescriptions[type];
                const IconComponent = desc.icon;
                
                return (
                  <div
                    key={type}
                    className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                      isActive 
                        ? "border-primary bg-primary/5" 
                        : provider?.available 
                          ? "hover-elevate" 
                          : "opacity-50 cursor-not-allowed"
                    }`}
                    onClick={() => {
                      if (switchProviderMutation.isPending) return;
                      
                      if (!provider?.available) {
                        toast({ 
                          title: language === "ru" ? "Провайдер недоступен" : "Provider unavailable",
                          description: provider?.reason || (language === "ru" 
                            ? "Настройте ключ API в Secrets" 
                            : "Configure API key in Secrets"),
                          variant: "destructive"
                        });
                        return;
                      }
                      
                      if (isActive) {
                        toast({ 
                          title: language === "ru" ? "Провайдер активен" : "Provider active",
                          description: language === "ru" 
                            ? "Этот провайдер уже выбран" 
                            : "This provider is already selected"
                        });
                        return;
                      }
                      
                      switchProviderMutation.mutate(type);
                    }}
                    data-testid={`provider-option-${type}`}
                  >
                    <div className={`mt-0.5 ${isActive ? "text-primary" : "text-muted-foreground"}`}>
                      <IconComponent className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`font-medium text-sm ${isActive ? "text-primary" : ""}`}>
                          {language === "ru" ? desc.name.ru : desc.name.en}
                        </span>
                        {isActive && (
                          <Badge variant="default" className="text-[10px] px-1.5 py-0">
                            {language === "ru" ? "АКТИВЕН" : "ACTIVE"}
                          </Badge>
                        )}
                        {!provider?.available && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            {language === "ru" ? "НЕ НАСТРОЕН" : "NOT SET"}
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
                    {switchProviderMutation.isPending && switchProviderMutation.variables === type && (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                  </div>
                );
              })}
            </div>

            {aiStatus?.providerType === "free" && (
              <div className="p-3 border rounded-lg bg-muted/30">
                <p className="text-xs font-medium mb-2">
                  {language === "ru" ? "Где взять бесплатный ключ:" : "Where to get a free key:"}
                </p>
                <div className="space-y-1">
                  {freeApiLinks.map((link) => (
                    <a
                      key={link.name}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-xs text-primary hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" />
                      <span>{link.name}</span>
                      <span className="text-muted-foreground">
                        — {language === "ru" ? link.note.ru : link.note.en}
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="space-y-0.5">
                <Label className="font-medium">{t("settings.fallbackMode")}</Label>
                <p className="text-xs text-muted-foreground">
                  {t("settings.fallbackModeDesc")}
                </p>
              </div>
              <Switch
                checked={settings.fallbackMode}
                onCheckedChange={(checked) => setSettings({ ...settings, fallbackMode: checked })}
                data-testid="switch-fallback"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <SettingsIcon className="h-4 w-4" />
              {t("settings.defaults")}
            </CardTitle>
            <CardDescription>
              {t("settings.defaultsDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("settings.defaultDuration")}</Label>
                <Select
                  value={settings.defaultDuration}
                  onValueChange={(v) => setSettings({ ...settings, defaultDuration: v as Duration })}
                >
                  <SelectTrigger data-testid="select-default-duration">
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
                <Label>{t("settings.defaultStyle")}</Label>
                <Select
                  value={settings.defaultStylePreset}
                  onValueChange={(v) => setSettings({ ...settings, defaultStylePreset: v as StylePreset })}
                >
                  <SelectTrigger data-testid="select-default-style">
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              {language === "ru" ? "Обучение и подсказки" : "Learning & Tips"}
            </CardTitle>
            <CardDescription>
              {language === "ru" 
                ? "Управление обучающими материалами и подсказками"
                : "Manage learning materials and tips"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-muted/50 border rounded-lg">
              <div className="flex items-center gap-3">
                <Lightbulb className="h-4 w-4 text-amber-500" />
                <div>
                  <p className="text-sm font-medium">
                    {language === "ru" ? "Показывать подсказки" : "Show tips"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {language === "ru" 
                      ? "Полезные советы по работе с приложением"
                      : "Helpful tips for using the application"}
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
              className="w-full sm:w-auto"
              data-testid="button-show-onboarding"
            >
              <BookOpen className="h-4 w-4 mr-2" />
              {language === "ru" ? "Показать онбординг" : "Show onboarding"}
            </Button>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            data-testid="button-save-settings"
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            {t("settings.save")}
          </Button>
        </div>
      </div>
    </Layout>
  );
}
