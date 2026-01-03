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
  AlertTriangle
} from "lucide-react";
import { useTipsVisibility } from "@/components/tips-bar";
import { useAdminAccess } from "@/lib/admin-access";
import type { Setting, Duration, StylePreset } from "@shared/schema";
import { stylePresetLabels } from "@shared/schema";

interface AIStatus {
  available: boolean;
  provider: string;
  fallbackMode: boolean;
  model: string;
  customApiAvailable?: boolean;
}

interface SettingsData {
  defaultDuration: Duration;
  defaultStylePreset: StylePreset;
  fallbackMode: boolean;
  useCustomApi: boolean;
}

const defaultSettings: SettingsData = {
  defaultDuration: "30",
  defaultStylePreset: "cinematic",
  fallbackMode: false,
  useCustomApi: false,
};

export default function Settings() {
  const { toast } = useToast();
  const { t, language } = useI18n();
  const { isUnlocked } = useAdminAccess();
  const [settings, setSettings] = useState<SettingsData>(defaultSettings);
  const { isHidden: tipsHidden, isDisabled: tipsDisabled, showTips, setTipsDisabled } = useTipsVisibility();

  const handleShowOnboarding = () => {
    localStorage.removeItem("idengine-onboarding-complete");
    toast({ 
      title: language === "ru" ? "Онбординг сброшен" : "Onboarding reset", 
      description: language === "ru" ? "Обновите страницу, чтобы увидеть онбординг снова." : "Refresh the page to see onboarding again."
    });
  };

  const handleShowTips = () => {
    showTips();
    toast({ 
      title: language === "ru" ? "Подсказки включены" : "Tips enabled",
      description: language === "ru" ? "Подсказки теперь будут отображаться." : "Tips will now be displayed."
    });
    window.location.reload();
  };

  const handleToggleTips = (enabled: boolean) => {
    setTipsDisabled(!enabled);
    if (enabled) {
      toast({ 
        title: language === "ru" ? "Подсказки включены" : "Tips enabled",
        description: language === "ru" ? "Подсказки теперь будут отображаться." : "Tips will now be displayed."
      });
    } else {
      toast({ 
        title: language === "ru" ? "Подсказки отключены" : "Tips disabled",
        description: language === "ru" ? "Подсказки больше не будут появляться." : "Tips will no longer appear."
      });
    }
  };

  const { data: savedSettings, isLoading } = useQuery<Setting[]>({
    queryKey: ["/api/settings"],
  });

  const { data: aiStatus } = useQuery<AIStatus>({
    queryKey: ["/api/ai/status"],
  });

  useEffect(() => {
    if (savedSettings) {
      const settingsMap = new Map(savedSettings.map((s) => [s.key, s.value]));
      setSettings({
        defaultDuration: (settingsMap.get("defaultDuration") as Duration) || "30",
        defaultStylePreset: (settingsMap.get("defaultStylePreset") as StylePreset) || "cinematic",
        fallbackMode: settingsMap.get("fallbackMode") === "true",
        useCustomApi: settingsMap.get("useCustomApi") === "true",
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
              {language === "ru" ? "AI Генерация" : "AI Generation"}
            </CardTitle>
            <CardDescription>
              {language === "ru" 
                ? "Статус подключения AI для генерации контента"
                : "AI connection status for content generation"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {aiStatus?.available ? (
              <div className="flex items-start gap-3 p-4 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-200">
                <Check className="h-5 w-5 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium">
                    {language === "ru" ? "AI подключен через Replit" : "AI connected via Replit"}
                  </p>
                  <p className="mt-1 text-emerald-700 dark:text-emerald-300">
                    {language === "ru" 
                      ? "Используется единый AI провайдер для всех функций: ассистент EDITO, генерация скриптов, хуков и раскадровок."
                      : "Using unified AI provider for all features: EDITO assistant, script, hook and storyboard generation."}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200">
                <Sparkles className="h-5 w-5 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium">
                    {language === "ru" ? "AI недоступен" : "AI unavailable"}
                  </p>
                  <p className="mt-1 text-amber-700 dark:text-amber-300">
                    {language === "ru" 
                      ? aiStatus?.fallbackMode 
                        ? "Включен режим шаблонов. Генерация использует заготовленные шаблоны вместо AI."
                        : "AI провайдер не настроен. Генерация будет использовать шаблоны."
                      : aiStatus?.fallbackMode
                        ? "Template mode enabled. Generation uses predefined templates instead of AI."
                        : "AI provider not configured. Generation will use templates."}
                  </p>
                </div>
              </div>
            )}

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

            {settings.fallbackMode && (
              <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200">
                <Sparkles className="h-5 w-5 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium">{t("settings.fallbackWarningTitle")}</p>
                  <p className="mt-1 text-amber-700 dark:text-amber-300">
                    {t("settings.fallbackWarningDesc")}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {isUnlocked && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Key className="h-4 w-4" />
                {language === "ru" ? "Свой API ключ" : "Custom API Key"}
              </CardTitle>
              <CardDescription>
                {language === "ru" 
                  ? "Использовать собственный OpenAI API ключ вместо встроенного"
                  : "Use your own OpenAI API key instead of built-in"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="space-y-0.5">
                  <Label className="font-medium">
                    {language === "ru" ? "Использовать свой ключ" : "Use custom key"}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {language === "ru" 
                      ? "Переключиться на собственный OpenAI API"
                      : "Switch to your own OpenAI API"}
                  </p>
                </div>
                <Switch
                  checked={settings.useCustomApi}
                  onCheckedChange={(checked) => setSettings({ ...settings, useCustomApi: checked })}
                  data-testid="switch-custom-api"
                />
              </div>

              {settings.useCustomApi && (
                <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200">
                  <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                  <div className="text-sm space-y-2">
                    <p className="font-medium">
                      {language === "ru" ? "Требуется секрет CUSTOM_OPENAI_API_KEY" : "CUSTOM_OPENAI_API_KEY secret required"}
                    </p>
                    <p className="text-amber-700 dark:text-amber-300">
                      {language === "ru" 
                        ? "Добавьте секрет CUSTOM_OPENAI_API_KEY во вкладке Secrets в Replit. После сохранения настроек все AI функции будут использовать ваш ключ."
                        : "Add CUSTOM_OPENAI_API_KEY secret in the Secrets tab in Replit. After saving, all AI features will use your key."}
                    </p>
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      {language === "ru" 
                        ? "Ваш ключ должен иметь доступ к GPT-4 и text-embedding-3-large"
                        : "Your key should have access to GPT-4 and text-embedding-3-large"}
                    </p>
                  </div>
                </div>
              )}

              {!settings.useCustomApi && (
                <div className="flex items-start gap-3 p-4 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-200">
                  <Check className="h-5 w-5 flex-shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium">
                      {language === "ru" ? "Используется встроенный AI" : "Using built-in AI"}
                    </p>
                    <p className="mt-1 text-emerald-700 dark:text-emerald-300">
                      {language === "ru" 
                        ? "Все AI функции работают через Replit AI Integrations"
                        : "All AI features work via Replit AI Integrations"}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

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
            <div className="flex items-center justify-between p-3 bg-muted/50 border">
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
            
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                variant="outline"
                onClick={handleShowOnboarding}
                className="flex-1"
                data-testid="button-show-onboarding"
              >
                <BookOpen className="h-4 w-4 mr-2" />
                {language === "ru" ? "Показать онбординг" : "Show onboarding"}
              </Button>
              
              {tipsHidden && !tipsDisabled && (
                <Button
                  variant="outline"
                  onClick={handleShowTips}
                  className="flex-1"
                  data-testid="button-show-tips"
                >
                  <Lightbulb className="h-4 w-4 mr-2" />
                  {language === "ru" ? "Показать подсказки" : "Show tips"}
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
