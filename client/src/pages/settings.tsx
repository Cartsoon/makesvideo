import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Key, 
  Save, 
  Check, 
  X, 
  Loader2,
  AlertCircle,
  Settings as SettingsIcon,
  Zap,
  RefreshCw,
  Lightbulb,
  BookOpen
} from "lucide-react";
import { useTipsVisibility } from "@/components/tips-bar";
import type { Setting, Duration, StylePreset } from "@shared/schema";
import { stylePresetLabels } from "@shared/schema";

type AIProvider = "openrouter" | "groq" | "together";

interface SettingsData {
  aiProvider: AIProvider;
  openrouterApiKey: string;
  groqApiKey: string;
  togetherApiKey: string;
  defaultModel: string;
  groqModel: string;
  togetherModel: string;
  defaultDuration: Duration;
  defaultStylePreset: StylePreset;
  fallbackMode: boolean;
}

const defaultSettings: SettingsData = {
  aiProvider: "openrouter",
  openrouterApiKey: "",
  groqApiKey: "",
  togetherApiKey: "",
  defaultModel: "openai/gpt-4o-mini",
  groqModel: "llama-3.3-70b-versatile",
  togetherModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
  defaultDuration: "30",
  defaultStylePreset: "cinematic",
  fallbackMode: true,
};

const providerInfo: Record<AIProvider, { name: string; url: string; prefix: string; free: boolean }> = {
  openrouter: { 
    name: "OpenRouter", 
    url: "https://openrouter.ai/keys", 
    prefix: "sk-or-",
    free: false
  },
  groq: { 
    name: "Groq", 
    url: "https://console.groq.com/keys", 
    prefix: "gsk_",
    free: true
  },
  together: { 
    name: "Together AI", 
    url: "https://api.together.xyz/settings/api-keys", 
    prefix: "",
    free: true
  }
};

export default function Settings() {
  const { toast } = useToast();
  const { t } = useI18n();
  const [settings, setSettings] = useState<SettingsData>(defaultSettings);
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const { isHidden: tipsHidden, isDisabled: tipsDisabled, showTips, setTipsDisabled } = useTipsVisibility();

  const handleShowOnboarding = () => {
    localStorage.removeItem("idengine-onboarding-complete");
    toast({ title: "Онбординг сброшен", description: "Обновите страницу, чтобы увидеть онбординг снова." });
  };

  const handleShowTips = () => {
    showTips();
    toast({ title: "Подсказки включены", description: "Подсказки теперь будут отображаться." });
    window.location.reload();
  };

  const handleToggleTips = (enabled: boolean) => {
    setTipsDisabled(!enabled);
    if (enabled) {
      toast({ title: "Подсказки включены", description: "Подсказки теперь будут отображаться." });
    } else {
      toast({ title: "Подсказки отключены", description: "Подсказки больше не будут появляться." });
    }
  };

  const { data: savedSettings, isLoading } = useQuery<Setting[]>({
    queryKey: ["/api/settings"],
  });

  useEffect(() => {
    if (savedSettings) {
      const settingsMap = new Map(savedSettings.map((s) => [s.key, s.value]));
      setSettings({
        aiProvider: (settingsMap.get("aiProvider") as AIProvider) || "openrouter",
        openrouterApiKey: settingsMap.get("openrouterApiKey") || "",
        groqApiKey: settingsMap.get("groqApiKey") || "",
        togetherApiKey: settingsMap.get("togetherApiKey") || "",
        defaultModel: settingsMap.get("defaultModel") || "openai/gpt-4o-mini",
        groqModel: settingsMap.get("groqModel") || "llama-3.3-70b-versatile",
        togetherModel: settingsMap.get("togetherModel") || "meta-llama/Llama-3.3-70B-Instruct-Turbo",
        defaultDuration: (settingsMap.get("defaultDuration") as Duration) || "30",
        defaultStylePreset: (settingsMap.get("defaultStylePreset") as StylePreset) || "cinematic",
        fallbackMode: settingsMap.get("fallbackMode") !== "false",
      });
    }
  }, [savedSettings]);

  const saveMutation = useMutation({
    mutationFn: (data: SettingsData) => apiRequest("POST", "/api/settings", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: t("settings.saved"), description: t("settings.savedDesc") });
    },
    onError: () => {
      toast({ title: t("common.error"), description: t("settings.saveError"), variant: "destructive" });
    },
  });

  const getCurrentApiKey = () => {
    switch (settings.aiProvider) {
      case "openrouter": return settings.openrouterApiKey;
      case "groq": return settings.groqApiKey;
      case "together": return settings.togetherApiKey;
    }
  };

  const handleTestConnection = async () => {
    setTestStatus("testing");
    try {
      await apiRequest("POST", "/api/settings/test", {
        apiKey: getCurrentApiKey(),
        model: settings.aiProvider === "openrouter" ? settings.defaultModel : 
               settings.aiProvider === "groq" ? settings.groqModel : settings.togetherModel,
        provider: settings.aiProvider,
      });
      setTestStatus("success");
      toast({ title: t("settings.connected"), description: t("settings.connectedDesc") });
    } catch (error) {
      setTestStatus("error");
      toast({ title: t("settings.failed"), description: t("settings.failedDesc"), variant: "destructive" });
    }
    setTimeout(() => setTestStatus("idle"), 3000);
  };

  const handleSave = () => {
    saveMutation.mutate(settings);
  };

  const currentProvider = providerInfo[settings.aiProvider];
  const hasApiKey = !!getCurrentApiKey();

  if (isLoading) {
    return (
      <Layout title={t("nav.settings")}>
        <div className="p-4 md:p-6 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </Layout>
    );
  }

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
              {t("settings.providerSelection")}
            </CardTitle>
            <CardDescription>
              {t("settings.providerSelectionDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-1 sm:gap-2">
              {(Object.keys(providerInfo) as AIProvider[]).map((provider) => (
                <Button
                  key={provider}
                  variant={settings.aiProvider === provider ? "default" : "outline"}
                  className="flex flex-col h-auto py-2 sm:py-3 gap-1 px-1 sm:px-3"
                  onClick={() => setSettings({ ...settings, aiProvider: provider })}
                  data-testid={`button-provider-${provider}`}
                >
                  <span className="font-medium text-xs sm:text-sm">{providerInfo[provider].name}</span>
                  {providerInfo[provider].free && (
                    <Badge variant="secondary" className="text-[10px] sm:text-xs px-1 sm:px-2">
                      {t("settings.freeTier")}
                    </Badge>
                  )}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Key className="h-4 w-4" />
              {currentProvider.name} {t("settings.apiConfig")}
            </CardTitle>
            <CardDescription>
              {t("settings.apiConfigDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="apiKey">{t("settings.apiKey")}</Label>
              <div className="flex gap-2">
                <Input
                  id="apiKey"
                  type="password"
                  placeholder={currentProvider.prefix + "..."}
                  value={getCurrentApiKey()}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (settings.aiProvider === "openrouter") {
                      setSettings({ ...settings, openrouterApiKey: value });
                    } else if (settings.aiProvider === "groq") {
                      setSettings({ ...settings, groqApiKey: value });
                    } else {
                      setSettings({ ...settings, togetherApiKey: value });
                    }
                  }}
                  data-testid="input-api-key"
                />
                <Button
                  variant="outline"
                  onClick={handleTestConnection}
                  disabled={!hasApiKey || testStatus === "testing"}
                  data-testid="button-test-connection"
                >
                  {testStatus === "testing" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : testStatus === "success" ? (
                    <Check className="h-4 w-4 text-emerald-500" />
                  ) : testStatus === "error" ? (
                    <X className="h-4 w-4 text-destructive" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("settings.getApiKey")}{" "}
                <a
                  href={currentProvider.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  {currentProvider.url.replace("https://", "")}
                </a>
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="model">{t("settings.model")}</Label>
              {settings.aiProvider === "openrouter" && (
                <Select
                  value={settings.defaultModel}
                  onValueChange={(v) => setSettings({ ...settings, defaultModel: v })}
                >
                  <SelectTrigger data-testid="select-model">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="openai/gpt-4o-mini">GPT-4o Mini</SelectItem>
                    <SelectItem value="openai/gpt-4o">GPT-4o</SelectItem>
                    <SelectItem value="anthropic/claude-3.5-sonnet">Claude 3.5 Sonnet</SelectItem>
                    <SelectItem value="anthropic/claude-3-haiku">Claude 3 Haiku</SelectItem>
                    <SelectItem value="google/gemini-pro">Gemini Pro</SelectItem>
                    <SelectItem value="meta-llama/llama-3.3-70b-instruct">Llama 3.3 70B</SelectItem>
                  </SelectContent>
                </Select>
              )}
              {settings.aiProvider === "groq" && (
                <Select
                  value={settings.groqModel}
                  onValueChange={(v) => setSettings({ ...settings, groqModel: v })}
                >
                  <SelectTrigger data-testid="select-model">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="llama-3.3-70b-versatile">Llama 3.3 70B</SelectItem>
                    <SelectItem value="llama-3.1-70b-versatile">Llama 3.1 70B</SelectItem>
                    <SelectItem value="llama-3.1-8b-instant">Llama 3.1 8B</SelectItem>
                    <SelectItem value="mixtral-8x7b-32768">Mixtral 8x7B</SelectItem>
                    <SelectItem value="gemma2-9b-it">Gemma 2 9B</SelectItem>
                  </SelectContent>
                </Select>
              )}
              {settings.aiProvider === "together" && (
                <Select
                  value={settings.togetherModel}
                  onValueChange={(v) => setSettings({ ...settings, togetherModel: v })}
                >
                  <SelectTrigger data-testid="select-model">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="meta-llama/Llama-3.3-70B-Instruct-Turbo">Llama 3.3 70B Turbo</SelectItem>
                    <SelectItem value="meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo">Llama 3.1 70B Turbo</SelectItem>
                    <SelectItem value="meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo">Llama 3.1 8B Turbo</SelectItem>
                    <SelectItem value="mistralai/Mixtral-8x7B-Instruct-v0.1">Mixtral 8x7B</SelectItem>
                    <SelectItem value="Qwen/Qwen2.5-72B-Instruct-Turbo">Qwen 2.5 72B</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="flex items-center justify-between p-4 border rounded-lg">
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

            {!hasApiKey && settings.fallbackMode && (
              <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200">
                <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium">{t("settings.fallbackWarningTitle")}</p>
                  <p className="mt-1 text-amber-700 dark:text-amber-300">
                    {t("settings.fallbackWarningDesc")}
                  </p>
                </div>
              </div>
            )}

            {hasApiKey && !settings.fallbackMode && (
              <div className="flex items-start gap-3 p-4 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-200">
                <Check className="h-5 w-5 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium">{t("settings.aiActiveTitle")}</p>
                  <p className="mt-1 text-emerald-700 dark:text-emerald-300">
                    {t("settings.aiActiveDesc")}
                  </p>
                </div>
              </div>
            )}
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
              Обучение и подсказки
            </CardTitle>
            <CardDescription>
              Управление обучающими материалами и подсказками
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-muted/50 border">
              <div className="flex items-center gap-3">
                <Lightbulb className="h-4 w-4 text-amber-500" />
                <div>
                  <p className="text-sm font-medium">Показывать подсказки</p>
                  <p className="text-xs text-muted-foreground">Полезные советы по работе с приложением</p>
                </div>
              </div>
              <Switch
                checked={!tipsDisabled}
                onCheckedChange={handleToggleTips}
                data-testid="switch-tips-enabled"
              />
            </div>
            
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                variant="outline"
                onClick={handleShowOnboarding}
                className="flex-1"
                data-testid="button-show-onboarding"
              >
                <BookOpen className="h-4 w-4 mr-2" />
                Показать онбординг
              </Button>
              
              {tipsHidden && !tipsDisabled && (
                <Button
                  variant="outline"
                  onClick={handleShowTips}
                  className="flex-1"
                  data-testid="button-show-tips"
                >
                  <Lightbulb className="h-4 w-4 mr-2" />
                  Показать подсказки
                </Button>
              )}
            </div>
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
