import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { Slider } from "@/components/ui/slider";
import { 
  ArrowLeft,
  Wand2,
  Loader2,
  Sparkles,
  Clock,
  Copy,
  Check,
  Hash,
  FileText,
  Mic,
  Film,
  AlertCircle,
  Languages,
  Palette,
  Timer,
  Edit3,
  Save,
  X,
  ExternalLink
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { StoryboardScene, StylePreset, Language } from "@shared/schema";
import { VoiceGenerator } from "@/components/voice-generator";

const STYLE_OPTIONS: { value: StylePreset; labelRu: string; labelEn: string }[] = [
  { value: "news", labelRu: "Новостной", labelEn: "News" },
  { value: "brainrot", labelRu: "Мемный", labelEn: "Meme" },
  { value: "storytelling", labelRu: "Сторителлинг", labelEn: "Storytelling" },
  { value: "crime", labelRu: "Криминальный", labelEn: "Crime" },
  { value: "detective", labelRu: "Детектив", labelEn: "Detective" },
  { value: "comedy", labelRu: "Комедийный", labelEn: "Comedy" },
  { value: "cinematic", labelRu: "Кинематографичный", labelEn: "Cinematic" },
  { value: "science", labelRu: "Научный", labelEn: "Science" },
  { value: "motivation", labelRu: "Мотивационный", labelEn: "Motivation" },
  { value: "howto", labelRu: "Инструкция", labelEn: "How-To" },
  { value: "top5", labelRu: "Топ-5", labelEn: "Top 5" },
  { value: "hottakes", labelRu: "Горячие мнения", labelEn: "Hot Takes" },
];

const DURATION_OPTIONS = [
  { value: 30, label: "30 сек" },
  { value: 45, label: "45 сек" },
  { value: 60, label: "1 мин" },
  { value: 90, label: "1.5 мин" },
  { value: 120, label: "2 мин" },
  { value: 180, label: "3 мин" },
  { value: 300, label: "5 мин" },
];

interface VoiceoverItem {
  timecode: string;
  text: string;
}

interface StoryboardItem {
  sceneNumber: number;
  visual: string;
  onScreenText: string;
  sfx: string;
  durationHint: string;
  stockKeywords?: string[];
  aiPrompt?: string;
}

interface GenerationResult {
  seoTitle: string;
  hashtags: string[];
  script: string;
  voiceover: VoiceoverItem[];
  storyboard: StoryboardItem[];
  analysis: {
    keyFacts: string[];
    missingInfo?: string[];
    suggestions?: string[];
  };
  scriptId?: string | null;
}

export default function TextToVideo() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { t, language: uiLanguage } = useI18n();
  
  const [inputText, setInputText] = useState("");
  const [genLanguage, setGenLanguage] = useState<Language>("ru");
  const [stylePreset, setStylePreset] = useState<StylePreset>("news");
  const [duration, setDuration] = useState(60);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [result, setResult] = useState<GenerationResult | null>(null);
  
  // Editable voiceover state
  const [editingVoiceover, setEditingVoiceover] = useState<VoiceoverItem[] | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  
  // Editable storyboard state
  const [editingStoryboard, setEditingStoryboard] = useState<StoryboardItem[] | null>(null);
  
  // Editable script state
  const [editingScript, setEditingScript] = useState<string | null>(null);
  
  const generateMutation = useMutation({
    mutationFn: async (data: { text: string; language: Language; style: StylePreset; duration: number }) => {
      const res = await fetch("/api/generate/text-to-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok) {
        const error = new Error(json.error || "Generation failed") as any;
        error.code = json.code;
        throw error;
      }
      return json;
    },
    onSuccess: (data: GenerationResult) => {
      setResult(data);
      setEditingVoiceover(null);
      setEditingIndex(null);
      toast({
        title: t("ttv.generationComplete"),
        description: t("ttv.generationCompleteDesc"),
      });
      // Invalidate scripts cache to show new script
      queryClient.invalidateQueries({ queryKey: ['/api/scripts'] });
    },
    onError: (error: any) => {
      // Check if it's an API key required error
      if (error?.code === "API_KEY_REQUIRED") {
        toast({
          title: t("ttv.apiKeyRequired"),
          description: error.message || t("ttv.apiKeyRequiredDesc"),
          variant: "destructive",
        });
      } else {
        toast({
          title: t("common.error"),
          description: error.message || t("ttv.generationError"),
          variant: "destructive",
        });
      }
    },
  });
  
  const saveVoiceoverMutation = useMutation({
    mutationFn: async ({ scriptId, voiceover }: { scriptId: string; voiceover: VoiceoverItem[] }) => {
      const res = await apiRequest("PATCH", `/api/scripts/${scriptId}/voiceover`, { voiceover });
      return res.json();
    },
    onSuccess: () => {
      if (editingVoiceover && result) {
        setResult({ ...result, voiceover: editingVoiceover });
      }
      setEditingVoiceover(null);
      setEditingIndex(null);
      toast({
        title: t("ttv.voiceoverSaved"),
        description: t("ttv.voiceoverSavedDesc"),
      });
      queryClient.invalidateQueries({ queryKey: ['/api/scripts'] });
    },
    onError: (error: Error) => {
      toast({
        title: t("common.error"),
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  const saveStoryboardMutation = useMutation({
    mutationFn: async ({ scriptId, storyboard }: { scriptId: string; storyboard: StoryboardItem[] }) => {
      const res = await apiRequest("PATCH", `/api/scripts/${scriptId}/storyboard`, { storyboard });
      return res.json();
    },
    onSuccess: () => {
      if (editingStoryboard && result) {
        setResult({ ...result, storyboard: editingStoryboard });
      }
      setEditingStoryboard(null);
      toast({
        title: t("ttv.storyboardSaved"),
        description: t("ttv.storyboardSavedDesc"),
      });
      queryClient.invalidateQueries({ queryKey: ['/api/scripts'] });
    },
    onError: (error: Error) => {
      toast({
        title: t("common.error"),
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  // Notify user when script is saved
  const showScriptSavedNotice = result?.scriptId ? true : false;

  const handleGenerate = () => {
    if (!inputText.trim()) {
      toast({
        title: t("ttv.textRequired"),
        description: t("ttv.textRequiredDesc"),
        variant: "destructive",
      });
      return;
    }
    
    if (inputText.length < 50) {
      toast({
        title: t("ttv.textTooShort"),
        description: t("ttv.textTooShortDesc"),
        variant: "destructive",
      });
      return;
    }

    generateMutation.mutate({
      text: inputText,
      language: genLanguage,
      style: stylePreset,
      duration,
    });
  };

  const handleCopy = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
      toast({ title: t("common.copied") });
    } catch {
      toast({ title: t("common.copyError"), variant: "destructive" });
    }
  };

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds} ${t("ttv.seconds")}`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins} ${t("ttv.minutes")} ${secs} ${t("ttv.seconds")}` : `${mins} ${t("ttv.minutes")}`;
  };

  const getStyleLabel = (style: StylePreset) => {
    const option = STYLE_OPTIONS.find(o => o.value === style);
    return uiLanguage === "ru" ? option?.labelRu : option?.labelEn;
  };
  
  // Voiceover editing helpers
  const startEditingVoiceover = () => {
    if (result) {
      setEditingVoiceover([...result.voiceover]);
    }
  };
  
  const cancelEditingVoiceover = () => {
    setEditingVoiceover(null);
    setEditingIndex(null);
  };
  
  const updateVoiceoverItem = (index: number, field: 'timecode' | 'text', value: string) => {
    if (editingVoiceover) {
      const updated = [...editingVoiceover];
      updated[index] = { ...updated[index], [field]: value };
      setEditingVoiceover(updated);
    }
  };
  
  const saveVoiceover = () => {
    if (result?.scriptId && editingVoiceover) {
      saveVoiceoverMutation.mutate({ scriptId: result.scriptId, voiceover: editingVoiceover });
    } else {
      // No scriptId - just update local state
      if (editingVoiceover && result) {
        setResult({ ...result, voiceover: editingVoiceover });
        setEditingVoiceover(null);
        toast({ title: t("ttv.voiceoverUpdated") });
      }
    }
  };
  
  const currentVoiceover = editingVoiceover || result?.voiceover || [];
  
  // Storyboard editing helpers
  const startEditingStoryboard = () => {
    if (result) {
      setEditingStoryboard([...result.storyboard]);
    }
  };
  
  const cancelEditingStoryboard = () => {
    setEditingStoryboard(null);
  };
  
  const updateStoryboardItem = (index: number, field: keyof StoryboardItem, value: string) => {
    if (editingStoryboard) {
      const updated = [...editingStoryboard];
      updated[index] = { ...updated[index], [field]: value };
      setEditingStoryboard(updated);
    }
  };
  
  const saveStoryboard = () => {
    if (result?.scriptId && editingStoryboard) {
      saveStoryboardMutation.mutate({ scriptId: result.scriptId, storyboard: editingStoryboard });
    } else {
      // No scriptId - just update local state
      if (editingStoryboard && result) {
        setResult({ ...result, storyboard: editingStoryboard });
        setEditingStoryboard(null);
        toast({ title: t("ttv.storyboardUpdated") });
      }
    }
  };
  
  const currentStoryboard = editingStoryboard || result?.storyboard || [];

  return (
    <Layout title={t("ttv.title")}>
      <div className="p-3 md:p-4 space-y-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/")}
            data-testid="button-back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <div className="w-1 h-6 bg-gradient-to-b from-rose-500 to-amber-500" />
            <h1 className="text-lg sm:text-2xl font-bold text-foreground uppercase tracking-wide" data-testid="text-page-title">
              {t("ttv.title")}
            </h1>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            <Card className="relative overflow-hidden border-rose-500/20">
              <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-rose-400" />
              <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-rose-400" />
              <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-amber-400" />
              <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-amber-400" />
              
              <CardContent className="p-4 space-y-4">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-rose-400" />
                  <Label className="text-sm font-semibold uppercase tracking-wide">
                    {t("ttv.inputLabel")}
                  </Label>
                </div>
                
                <Textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder={t("ttv.inputPlaceholder")}
                  className="min-h-[200px] sm:min-h-[280px] resize-none bg-neutral-900/50 border-neutral-700 focus:border-rose-400 text-base"
                  data-testid="input-source-text"
                />
                
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{inputText.length} {t("ttv.characters")}</span>
                  <span className="text-amber-400">
                    {inputText.length < 50 && inputText.length > 0 && t("ttv.minCharacters")}
                  </span>
                </div>
              </CardContent>
            </Card>

            {result && (
              <div className="space-y-4">
                {result.analysis?.missingInfo && result.analysis.missingInfo.length > 0 && (
                  <Card className="border-amber-500/30 bg-amber-500/5">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="font-semibold text-amber-400 text-sm uppercase tracking-wide mb-2">
                            {t("ttv.analysisNotes")}
                          </p>
                          <ul className="space-y-1 text-sm text-muted-foreground">
                            {result.analysis.missingInfo.map((info, i) => (
                              <li key={i} className="flex items-start gap-2">
                                <span className="text-amber-400">-</span>
                                {info}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                <Card className="relative overflow-hidden border-emerald-500/20">
                  <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-emerald-400" />
                  <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-emerald-400" />
                  <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-emerald-400" />
                  <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-emerald-400" />
                  
                  <CardContent className="p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-emerald-400" />
                        <span className="font-semibold text-sm uppercase tracking-wide">{t("ttv.seoTitle")}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleCopy(result.seoTitle, "title")}
                        data-testid="button-copy-title"
                      >
                        {copiedField === "title" ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                    <p className="text-lg font-medium" data-testid="text-seo-title">{result.seoTitle}</p>
                  </CardContent>
                </Card>

                <Card className="relative overflow-hidden border-blue-500/20">
                  <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-blue-400" />
                  <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-blue-400" />
                  <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-blue-400" />
                  <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-blue-400" />
                  
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Hash className="h-5 w-5 text-blue-400" />
                        <span className="font-semibold text-sm uppercase tracking-wide">{t("ttv.hashtags")}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleCopy(result.hashtags.join(" "), "hashtags")}
                        data-testid="button-copy-hashtags"
                      >
                        {copiedField === "hashtags" ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2" data-testid="container-hashtags">
                      {result.hashtags.map((tag, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card className="relative overflow-hidden border-purple-500/20">
                  <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-purple-400" />
                  <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-purple-400" />
                  <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-purple-400" />
                  <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-purple-400" />
                  
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileText className="h-5 w-5 text-purple-400" />
                        <span className="font-semibold text-sm uppercase tracking-wide">{t("ttv.fullScript")}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleCopy(result.script, "script")}
                        data-testid="button-copy-script"
                      >
                        {copiedField === "script" ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                    <div className="p-3 bg-neutral-900/50 rounded text-sm whitespace-pre-wrap max-h-[300px] overflow-y-auto" data-testid="text-script">
                      {result.script}
                    </div>
                  </CardContent>
                </Card>

                <Card className="relative overflow-hidden border-cyan-500/20">
                  <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-cyan-400" />
                  <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-cyan-400" />
                  <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-cyan-400" />
                  <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-cyan-400" />
                  
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <Mic className="h-5 w-5 text-cyan-400" />
                        <span className="font-semibold text-sm uppercase tracking-wide">{t("ttv.voiceover")}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {editingVoiceover ? (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={saveVoiceover}
                              disabled={saveVoiceoverMutation.isPending}
                              data-testid="button-save-voiceover"
                            >
                              {saveVoiceoverMutation.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Save className="h-4 w-4 text-emerald-400" />
                              )}
                              <span className="ml-1">{t("common.save")}</span>
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={cancelEditingVoiceover}
                              data-testid="button-cancel-edit-voiceover"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={startEditingVoiceover}
                              data-testid="button-edit-voiceover"
                            >
                              <Edit3 className="h-4 w-4" />
                              <span className="ml-1">{t("common.edit")}</span>
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleCopy(
                                result.voiceover.map(v => `${v.timecode} - ${v.text}`).join("\n"),
                                "voiceover"
                              )}
                              data-testid="button-copy-voiceover"
                            >
                              {copiedField === "voiceover" ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-28">{t("ttv.timecode")}</TableHead>
                            <TableHead>{t("ttv.voiceText")}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {currentVoiceover.map((item, i) => (
                            <TableRow key={i} data-testid={`row-voiceover-${i}`}>
                              <TableCell className="font-mono text-cyan-400">
                                {editingVoiceover ? (
                                  <Input
                                    value={item.timecode}
                                    onChange={(e) => updateVoiceoverItem(i, 'timecode', e.target.value)}
                                    className="h-8 w-24 font-mono text-xs"
                                    data-testid={`input-timecode-${i}`}
                                  />
                                ) : (
                                  item.timecode
                                )}
                              </TableCell>
                              <TableCell>
                                {editingVoiceover ? (
                                  <Textarea
                                    value={item.text}
                                    onChange={(e) => updateVoiceoverItem(i, 'text', e.target.value)}
                                    className="min-h-[60px] text-sm resize-none"
                                    data-testid={`input-voicetext-${i}`}
                                  />
                                ) : (
                                  item.text
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>

                <Card className="relative overflow-hidden border-orange-500/20">
                  <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-orange-400" />
                  <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-orange-400" />
                  <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-orange-400" />
                  <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-orange-400" />
                  
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <Film className="h-5 w-5 text-orange-400" />
                        <span className="font-semibold text-sm uppercase tracking-wide">{t("ttv.storyboard")}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {editingStoryboard ? (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={saveStoryboard}
                              disabled={saveStoryboardMutation.isPending}
                              data-testid="button-save-storyboard"
                            >
                              {saveStoryboardMutation.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Save className="h-4 w-4 text-emerald-400" />
                              )}
                              <span className="ml-1">{t("common.save")}</span>
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={cancelEditingStoryboard}
                              data-testid="button-cancel-edit-storyboard"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={startEditingStoryboard}
                              data-testid="button-edit-storyboard"
                            >
                              <Edit3 className="h-4 w-4" />
                              <span className="ml-1">{t("common.edit")}</span>
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleCopy(
                                result.storyboard.map(s => `${s.sceneNumber}. ${s.visual} | ${s.onScreenText} | ${s.sfx}`).join("\n"),
                                "storyboard"
                              )}
                              data-testid="button-copy-storyboard"
                            >
                              {copiedField === "storyboard" ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-12">#</TableHead>
                            <TableHead className="w-20">{t("ttv.time")}</TableHead>
                            <TableHead>{t("ttv.visual")}</TableHead>
                            <TableHead>{t("ttv.onScreenText")}</TableHead>
                            <TableHead className="w-24">{t("ttv.sfx")}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {currentStoryboard.map((scene, i) => (
                            <TableRow key={i} data-testid={`row-storyboard-${i}`}>
                              <TableCell className="font-mono text-orange-400">{scene.sceneNumber || i + 1}</TableCell>
                              <TableCell className="font-mono text-muted-foreground">
                                {editingStoryboard ? (
                                  <Input
                                    value={scene.durationHint}
                                    onChange={(e) => updateStoryboardItem(i, 'durationHint', e.target.value)}
                                    className="h-8 w-16 font-mono text-xs"
                                    data-testid={`input-duration-${i}`}
                                  />
                                ) : (
                                  scene.durationHint
                                )}
                              </TableCell>
                              <TableCell>
                                {editingStoryboard ? (
                                  <Textarea
                                    value={scene.visual}
                                    onChange={(e) => updateStoryboardItem(i, 'visual', e.target.value)}
                                    className="min-h-[50px] text-sm resize-none"
                                    data-testid={`input-visual-${i}`}
                                  />
                                ) : (
                                  <span className="text-sm">{scene.visual}</span>
                                )}
                              </TableCell>
                              <TableCell>
                                {editingStoryboard ? (
                                  <Input
                                    value={scene.onScreenText}
                                    onChange={(e) => updateStoryboardItem(i, 'onScreenText', e.target.value)}
                                    className="h-8 text-xs"
                                    placeholder="..."
                                    data-testid={`input-onscreen-${i}`}
                                  />
                                ) : (
                                  scene.onScreenText && (
                                    <Badge variant="outline" className="text-xs">
                                      {scene.onScreenText}
                                    </Badge>
                                  )
                                )}
                              </TableCell>
                              <TableCell>
                                {editingStoryboard ? (
                                  <Input
                                    value={scene.sfx}
                                    onChange={(e) => updateStoryboardItem(i, 'sfx', e.target.value)}
                                    className="h-8 w-20 text-xs"
                                    placeholder="SFX..."
                                    data-testid={`input-sfx-${i}`}
                                  />
                                ) : (
                                  <span className="text-xs text-muted-foreground">{scene.sfx}</span>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>

                {result.script && (
                  <VoiceGenerator 
                    text={result.voiceover.map(v => v.text).join("\n")}
                    stylePreset={stylePreset}
                    language={genLanguage}
                  />
                )}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <Card className="relative overflow-hidden border-neutral-700 sticky top-4">
              <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-neutral-500" />
              <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-neutral-500" />
              <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-neutral-500" />
              <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-neutral-500" />
              
              <CardContent className="p-4 space-y-5">
                <div className="flex items-center gap-2 pb-3 border-b border-neutral-700">
                  <Wand2 className="h-5 w-5 text-rose-400" />
                  <span className="font-semibold text-sm uppercase tracking-wide">{t("ttv.settings")}</span>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Languages className="h-4 w-4 text-muted-foreground" />
                    <Label className="text-sm">{t("ttv.language")}</Label>
                  </div>
                  <Select value={genLanguage} onValueChange={(v) => setGenLanguage(v as Language)}>
                    <SelectTrigger data-testid="select-language">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ru">Русский</SelectItem>
                      <SelectItem value="en">English</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Palette className="h-4 w-4 text-muted-foreground" />
                    <Label className="text-sm">{t("ttv.style")}</Label>
                  </div>
                  <Select value={stylePreset} onValueChange={(v) => setStylePreset(v as StylePreset)}>
                    <SelectTrigger data-testid="select-style">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STYLE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {uiLanguage === "ru" ? option.labelRu : option.labelEn}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Timer className="h-4 w-4 text-muted-foreground" />
                      <Label className="text-sm">{t("ttv.duration")}</Label>
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      {formatDuration(duration)}
                    </Badge>
                  </div>
                  <Slider
                    value={[duration]}
                    onValueChange={(v) => setDuration(v[0])}
                    min={30}
                    max={300}
                    step={15}
                    className="w-full"
                    data-testid="slider-duration"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>30 {t("ttv.sec")}</span>
                    <span>5 {t("ttv.min")}</span>
                  </div>
                </div>

                <Button
                  onClick={handleGenerate}
                  disabled={generateMutation.isPending || !inputText.trim()}
                  className="w-full relative overflow-hidden bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-600 hover:to-amber-600 text-white font-semibold"
                  data-testid="button-generate"
                >
                  <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-white/30" />
                  <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-white/30" />
                  <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-white/30" />
                  <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-white/30" />
                  
                  {generateMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {t("ttv.generating")}
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" />
                      {t("ttv.generate")}
                    </>
                  )}
                </Button>

                {generateMutation.isPending && (
                  <div className="text-center text-xs text-muted-foreground animate-pulse">
                    {t("ttv.generatingHint")}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-neutral-700">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t("ttv.hint")}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}
