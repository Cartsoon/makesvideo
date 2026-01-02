import { useState, useMemo, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import { useQuery } from "@tanstack/react-query";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import {
  Play,
  Copy,
  Volume2,
  StopCircle,
  Check,
  ExternalLink,
  Mic,
  Sparkles,
  User,
  Zap,
  Coffee,
  Smile,
  Download,
  Loader2
} from "lucide-react";
import type { StylePreset } from "@shared/schema";

interface EdgeVoice {
  id: string;
  name: string;
  locale: string;
  gender: string;
  language: string;
}

interface VoiceGeneratorProps {
  text: string;
  language: "ru" | "en";
  stylePreset: StylePreset;
}

interface VoiceStyleConfig {
  id: string;
  icon: typeof Mic;
  recommendedVoices: {
    en: string[];
    ru: string[];
  };
  ttsSettings: {
    speed: number;
    pitch: number;
  };
}

const voiceStyles: VoiceStyleConfig[] = [
  {
    id: "narrator",
    icon: Mic,
    recommendedVoices: {
      en: ["Rachel (ElevenLabs)", "Adam (ElevenLabs)", "Josh (Murf)", "Matthew (Amazon Polly)"],
      ru: ["Alena (Yandex)", "Filipp (Yandex)", "Tatyana (Google)", "Maxim (Amazon Polly)"]
    },
    ttsSettings: { speed: 0.95, pitch: 1.0 }
  },
  {
    id: "energetic",
    icon: Zap,
    recommendedVoices: {
      en: ["Bella (ElevenLabs)", "Sam (ElevenLabs)", "Natalie (Murf)", "Joanna (Amazon Polly)"],
      ru: ["Zakhar (Yandex)", "Kseniya (Silero)", "Pavel (Google)", "Olga (ttsMP3)"]
    },
    ttsSettings: { speed: 1.15, pitch: 1.1 }
  },
  {
    id: "calm",
    icon: Coffee,
    recommendedVoices: {
      en: ["Elli (ElevenLabs)", "Antoni (ElevenLabs)", "Marcus (Murf)", "Brian (Amazon Polly)"],
      ru: ["Ermil (Yandex)", "Oksana (Silero)", "Elena (Google)", "Marina (ttsMP3)"]
    },
    ttsSettings: { speed: 0.9, pitch: 0.95 }
  },
  {
    id: "meme",
    icon: Smile,
    recommendedVoices: {
      en: ["Clyde (ElevenLabs)", "Freya (ElevenLabs)", "Julia (Murf)", "Joey (Amazon Polly)"],
      ru: ["Kost (Silero)", "Olga (Silero)", "Dmitry (Google)", "Vitaly (ttsMP3)"]
    },
    ttsSettings: { speed: 1.2, pitch: 1.15 }
  },
  {
    id: "news",
    icon: User,
    recommendedVoices: {
      en: ["Daniel (ElevenLabs)", "Charlotte (ElevenLabs)", "Ken (Murf)", "Amy (Amazon Polly)"],
      ru: ["Artem (Yandex)", "Natalya (Silero)", "Pavel (Google)", "Sergey (ttsMP3)"]
    },
    ttsSettings: { speed: 1.0, pitch: 1.0 }
  }
];

interface ExternalService {
  id: string;
  name: string;
  url: string;
  supportsRussian: boolean;
  supportsDownload: boolean;
}

const externalServices: ExternalService[] = [
  {
    id: "ttsmp3",
    name: "ttsMP3",
    url: "https://ttsmp3.com",
    supportsRussian: true,
    supportsDownload: true
  },
  {
    id: "elevenlabs",
    name: "ElevenLabs",
    url: "https://elevenlabs.io/app/speech-synthesis",
    supportsRussian: true,
    supportsDownload: true
  },
  {
    id: "freetts",
    name: "FreeTTS",
    url: "https://freetts.com",
    supportsRussian: true,
    supportsDownload: true
  },
  {
    id: "murf",
    name: "Murf AI",
    url: "https://murf.ai/studio",
    supportsRussian: true,
    supportsDownload: true
  },
  {
    id: "speechify",
    name: "Speechify",
    url: "https://speechify.com/text-to-speech-online",
    supportsRussian: true,
    supportsDownload: false
  }
];

function mapStylePresetToVoiceStyle(preset: StylePreset): string {
  const mapping: Record<StylePreset, string> = {
    news: "news",
    crime: "narrator",
    detective: "narrator",
    storytelling: "calm",
    comedy: "energetic",
    classic: "calm",
    tarantino: "dramatic",
    anime: "dramatic",
    brainrot: "meme",
    adult: "calm",
    howto: "energetic",
    mythbusting: "news",
    top5: "energetic",
    hottakes: "news",
    pov: "dramatic",
    cinematic: "narrator",
    science: "narrator",
    motivation: "dramatic",
    versus: "energetic",
    mistake: "calm"
  };
  return mapping[preset] || "narrator";
}

function splitIntoPhrases(text: string): string[] {
  if (!text) return [];
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
  
  const phrases: string[] = [];
  for (const sentence of sentences) {
    if (sentence.length > 100) {
      const parts = sentence.split(/(?<=[,;:])\s+/);
      phrases.push(...parts.filter(p => p.length > 0));
    } else {
      phrases.push(sentence);
    }
  }
  
  return phrases;
}

export function VoiceGenerator({ text, language, stylePreset }: VoiceGeneratorProps) {
  const { toast } = useToast();
  const { t } = useI18n();
  const [selectedStyle, setSelectedStyle] = useState<string>(() => mapStylePresetToVoiceStyle(stylePreset));
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Edge TTS state
  const [selectedEdgeVoice, setSelectedEdgeVoice] = useState<string>("");
  const [ttsRate, setTtsRate] = useState(0);
  const [ttsPitch, setTtsPitch] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedAudioUrl, setGeneratedAudioUrl] = useState<string | null>(null);
  
  // Fetch available Edge TTS voices
  const { data: edgeVoices, isLoading: voicesLoading } = useQuery<EdgeVoice[]>({
    queryKey: ["/api/tts/voices"],
  });
  
  // Popular Russian Edge TTS voices (hardcoded to ensure availability)
  const popularRussianVoices: EdgeVoice[] = [
    { id: "ru-RU-SvetlanaNeural", name: "Svetlana (Neural)", locale: "ru-RU", gender: "Female", language: "ru" },
    { id: "ru-RU-DmitryNeural", name: "Dmitry (Neural)", locale: "ru-RU", gender: "Male", language: "ru" },
    { id: "ru-RU-DariyaNeural", name: "Dariya (Neural)", locale: "ru-RU", gender: "Female", language: "ru" },
  ];
  
  // Popular English Edge TTS voices
  const popularEnglishVoices: EdgeVoice[] = [
    { id: "en-US-JennyNeural", name: "Jenny (Neural)", locale: "en-US", gender: "Female", language: "en" },
    { id: "en-US-GuyNeural", name: "Guy (Neural)", locale: "en-US", gender: "Male", language: "en" },
    { id: "en-US-AriaNeural", name: "Aria (Neural)", locale: "en-US", gender: "Female", language: "en" },
    { id: "en-US-DavisNeural", name: "Davis (Neural)", locale: "en-US", gender: "Male", language: "en" },
    { id: "en-GB-SoniaNeural", name: "Sonia (British)", locale: "en-GB", gender: "Female", language: "en" },
    { id: "en-GB-RyanNeural", name: "Ryan (British)", locale: "en-GB", gender: "Male", language: "en" },
  ];
  
  // Filter voices by language, merge with popular voices
  const filteredVoices = useMemo(() => {
    const langCode = language === "ru" ? "ru" : "en";
    const popularVoices = language === "ru" ? popularRussianVoices : popularEnglishVoices;
    
    // Get API voices
    const apiVoices = edgeVoices?.filter(v => v.language === langCode) || [];
    
    // Merge, avoiding duplicates by ID
    const existingIds = new Set(apiVoices.map(v => v.id));
    const combined = [...popularVoices.filter(v => !existingIds.has(v.id)), ...apiVoices];
    
    return combined;
  }, [edgeVoices, language]);
  
  // Set default voice when voices load
  useEffect(() => {
    if (filteredVoices.length > 0 && !selectedEdgeVoice) {
      // Pick a good default voice
      const defaultVoice = filteredVoices.find(v => 
        v.name.toLowerCase().includes("neural") || 
        v.id.includes("Neural")
      ) || filteredVoices[0];
      setSelectedEdgeVoice(defaultVoice.id);
    }
  }, [filteredVoices, selectedEdgeVoice]);
  
  // Generate audio with Edge TTS
  const handleGenerateAudio = useCallback(async () => {
    if (!text.trim() || !selectedEdgeVoice) {
      toast({
        title: t("tts.noText"),
        description: t("tts.noTextDesc"),
        variant: "destructive",
      });
      return;
    }
    
    setIsGenerating(true);
    setGeneratedAudioUrl(null);
    
    try {
      const rateStr = ttsRate >= 0 ? `+${ttsRate}%` : `${ttsRate}%`;
      const pitchStr = ttsPitch >= 0 ? `+${ttsPitch}Hz` : `${ttsPitch}Hz`;
      
      const response = await fetch("/api/tts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          voice: selectedEdgeVoice,
          rate: rateStr,
          pitch: pitchStr,
        }),
      });
      
      if (!response.ok) {
        throw new Error("Generation failed");
      }
      
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setGeneratedAudioUrl(url);
      
      toast({
        title: t("common.success"),
        description: t("voice.downloadMp3"),
      });
    } catch (error) {
      toast({
        title: t("common.error"),
        description: t("voice.generationError"),
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  }, [text, selectedEdgeVoice, ttsRate, ttsPitch, toast, t]);
  
  // Download generated audio
  const handleDownloadAudio = useCallback(() => {
    if (!generatedAudioUrl) return;
    
    const link = document.createElement("a");
    link.href = generatedAudioUrl;
    link.download = "voiceover.mp3";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [generatedAudioUrl]);
  
  useEffect(() => {
    setSelectedStyle(mapStylePresetToVoiceStyle(stylePreset));
  }, [stylePreset]);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);
  
  const phrases = useMemo(() => splitIntoPhrases(text), [text]);
  const currentStyle = voiceStyles.find(s => s.id === selectedStyle) || voiceStyles[0];
  
  const handleCopyPhrase = useCallback(async (phrase: string, index: number) => {
    try {
      await navigator.clipboard.writeText(phrase);
      setCopiedIndex(index);
      const timeoutId = setTimeout(() => setCopiedIndex(null), 2000);
      return () => clearTimeout(timeoutId);
    } catch {
      setCopiedIndex(null);
      toast({ 
        title: t("common.error"), 
        description: t("tts.copyError"),
        variant: "destructive" 
      });
    }
  }, [toast, t]);
  
  const handleCopyAll = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedAll(true);
      toast({ 
        title: t("tts.copied"), 
        description: t("voice.copiedForService")
      });
      setTimeout(() => setCopiedAll(false), 2000);
    } catch {
      toast({ 
        title: t("common.error"), 
        description: t("tts.copyError"),
        variant: "destructive" 
      });
    }
  }, [text, toast, t]);
  
  const handleOpenService = useCallback(async (serviceUrl: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ 
        title: t("tts.copied"), 
        description: t("voice.pasteInService")
      });
      window.open(serviceUrl, "_blank");
    } catch {
      toast({ 
        title: t("common.error"), 
        description: t("tts.copyError"),
        variant: "destructive" 
      });
    }
  }, [text, toast, t]);
  
  const handleBrowserPreview = useCallback(() => {
    if (!text.trim()) {
      toast({
        title: t("tts.noText"),
        description: t("tts.noTextDesc"),
        variant: "destructive",
      });
      return;
    }

    if (typeof window === "undefined" || !window.speechSynthesis) {
      toast({
        title: t("common.error"),
        description: t("tts.notSupported"),
        variant: "destructive",
      });
      return;
    }

    if (isPlaying) {
      window.speechSynthesis.cancel();
      setIsPlaying(false);
      return;
    }

    const speakText = () => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = currentStyle.ttsSettings.speed;
      utterance.pitch = currentStyle.ttsSettings.pitch;
      utterance.lang = language === "ru" ? "ru-RU" : "en-US";
      
      const voices = window.speechSynthesis.getVoices();
      const langVoice = voices.find(v => v.lang.startsWith(language === "ru" ? "ru" : "en"));
      if (langVoice) {
        utterance.voice = langVoice;
      }
      
      utterance.onstart = () => setIsPlaying(true);
      utterance.onend = () => setIsPlaying(false);
      utterance.onerror = () => {
        setIsPlaying(false);
        toast({
          title: t("common.error"),
          description: t("tts.playbackError"),
          variant: "destructive",
        });
      };

      window.speechSynthesis.speak(utterance);
    };

    const voices = window.speechSynthesis.getVoices();
    if (voices.length === 0) {
      const handleVoicesChanged = () => {
        window.speechSynthesis.removeEventListener("voiceschanged", handleVoicesChanged);
        speakText();
      };
      window.speechSynthesis.addEventListener("voiceschanged", handleVoicesChanged);
      setTimeout(() => {
        window.speechSynthesis.removeEventListener("voiceschanged", handleVoicesChanged);
        if (window.speechSynthesis.getVoices().length > 0) {
          speakText();
        } else {
          toast({
            title: t("common.error"),
            description: t("tts.notSupported"),
            variant: "destructive",
          });
        }
      }, 2000);
    } else {
      speakText();
    }
  }, [text, isPlaying, currentStyle.ttsSettings, language, toast, t]);

  const formatPhrasesForCopy = useCallback(() => {
    return phrases.map((p, i) => `[${i + 1}] ${p}`).join("\n\n");
  }, [phrases]);
  
  const handleCopyFormatted = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(formatPhrasesForCopy());
      toast({ 
        title: t("tts.copied"), 
        description: t("voice.numberedCopied")
      });
    } catch {
      toast({ 
        title: t("common.error"), 
        description: t("tts.copyError"),
        variant: "destructive" 
      });
    }
  }, [formatPhrasesForCopy, toast, t]);

  if (!text) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Volume2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">
            {t("voice.generateFirst")}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Volume2 className="h-4 w-4" />
          {t("voice.title")}
        </CardTitle>
        <CardDescription>
          {t("voice.description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Tabs defaultValue="generate" className="w-full">
          <TabsList className="grid w-full grid-cols-4 h-auto gap-1">
            <TabsTrigger value="generate" data-testid="tab-voice-generate" className="flex-col sm:flex-row gap-1 py-2 px-1 sm:px-3 min-w-0">
              <Mic className="h-4 w-4 flex-shrink-0" />
              <span className="hidden sm:inline text-xs sm:text-sm truncate">{t("voice.generateTab")}</span>
            </TabsTrigger>
            <TabsTrigger value="style" data-testid="tab-voice-style" className="flex-col sm:flex-row gap-1 py-2 px-1 sm:px-3 min-w-0">
              <Sparkles className="h-4 w-4 flex-shrink-0" />
              <span className="hidden sm:inline text-xs sm:text-sm truncate">{t("voice.styleTab")}</span>
            </TabsTrigger>
            <TabsTrigger value="phrases" data-testid="tab-voice-phrases" className="flex-col sm:flex-row gap-1 py-2 px-1 sm:px-3 min-w-0">
              <Copy className="h-4 w-4 flex-shrink-0" />
              <span className="hidden sm:inline text-xs sm:text-sm truncate">{t("voice.phrasesTab")}</span>
            </TabsTrigger>
            <TabsTrigger value="services" data-testid="tab-voice-services" className="flex-col sm:flex-row gap-1 py-2 px-1 sm:px-3 min-w-0">
              <ExternalLink className="h-4 w-4 flex-shrink-0" />
              <span className="hidden sm:inline text-xs sm:text-sm truncate">{t("voice.downloadTab")}</span>
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="generate" className="space-y-4 mt-4">
            <p className="text-xs sm:text-sm text-muted-foreground">
              {t("voice.generateHint")}
            </p>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edge-voice">{t("voice.selectEdgeVoice")}</Label>
                {voicesLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t("voice.loadingVoices")}
                  </div>
                ) : filteredVoices.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("voice.noVoices")}</p>
                ) : (
                  <Select value={selectedEdgeVoice} onValueChange={setSelectedEdgeVoice}>
                    <SelectTrigger id="edge-voice" data-testid="select-edge-voice">
                      <SelectValue placeholder={t("voice.selectEdgeVoice")} />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredVoices.map((voice) => (
                        <SelectItem key={voice.id} value={voice.id}>
                          {voice.name} ({voice.gender})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("voice.rate")}: {ttsRate > 0 ? `+${ttsRate}` : ttsRate}%</Label>
                  <Slider
                    value={[ttsRate]}
                    onValueChange={([v]) => setTtsRate(v)}
                    min={-50}
                    max={100}
                    step={10}
                    data-testid="slider-tts-rate"
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("voice.pitch")}: {ttsPitch > 0 ? `+${ttsPitch}` : ttsPitch}Hz</Label>
                  <Slider
                    value={[ttsPitch]}
                    onValueChange={([v]) => setTtsPitch(v)}
                    min={-50}
                    max={50}
                    step={10}
                    data-testid="slider-tts-pitch"
                  />
                </div>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-2 pt-2">
                <Button
                  onClick={handleGenerateAudio}
                  disabled={isGenerating || !selectedEdgeVoice}
                  className="flex-1"
                  data-testid="button-generate-audio"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {t("voice.generating")}
                    </>
                  ) : (
                    <>
                      <Mic className="h-4 w-4 mr-2" />
                      {t("voice.generateMp3")}
                    </>
                  )}
                </Button>
                
                {generatedAudioUrl && (
                  <Button
                    onClick={handleDownloadAudio}
                    variant="outline"
                    className="flex-1"
                    data-testid="button-download-audio"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    {t("voice.downloadMp3")}
                  </Button>
                )}
              </div>
              
              {generatedAudioUrl && (
                <div className="pt-2">
                  <audio 
                    controls 
                    src={generatedAudioUrl} 
                    className="w-full"
                    data-testid="audio-preview"
                  />
                </div>
              )}
            </div>
            
            <div className="p-3 rounded-lg bg-muted/50 border">
              <p className="text-xs text-muted-foreground">
                {t("voice.voiceQuality")}
              </p>
            </div>
          </TabsContent>
          
          <TabsContent value="style" className="space-y-4 mt-4">
            <div className="grid gap-2">
              {voiceStyles.map((style) => {
                const Icon = style.icon;
                const isSelected = selectedStyle === style.id;
                return (
                  <div
                    key={style.id}
                    className={`p-3 rounded-lg border cursor-pointer transition-all ${
                      isSelected 
                        ? "border-primary bg-primary/5" 
                        : "border-border hover:border-primary/50"
                    }`}
                    onClick={() => setSelectedStyle(style.id)}
                    data-testid={`voice-style-${style.id}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-md bg-muted text-muted-foreground">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {t(`voice.style.${style.id}`)}
                          </span>
                          {isSelected && (
                            <Badge variant="secondary" className="text-xs">
                              {t("voice.selected")}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {t(`voice.style.${style.id}.desc`)}
                        </p>
                      </div>
                    </div>
                    {isSelected && (
                      <div className="mt-3 pt-3 border-t space-y-3">
                        <div>
                          <p className="text-xs font-medium mb-2">
                            {t("voice.recommendedVoices")} (EN)
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {style.recommendedVoices.en.map((voice, idx) => (
                              <Badge 
                                key={idx} 
                                variant={language === "en" ? "default" : "outline"} 
                                className="text-xs cursor-pointer"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigator.clipboard.writeText(voice);
                                  toast({ 
                                    title: t("tts.copied"), 
                                    description: voice 
                                  });
                                }}
                                data-testid={`voice-badge-en-${idx}`}
                              >
                                {voice}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="text-xs font-medium mb-2">
                            {t("voice.recommendedVoices")} (RU)
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {style.recommendedVoices.ru.map((voice, idx) => (
                              <Badge 
                                key={idx} 
                                variant={language === "ru" ? "default" : "outline"} 
                                className="text-xs cursor-pointer"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigator.clipboard.writeText(voice);
                                  toast({ 
                                    title: t("tts.copied"), 
                                    description: voice 
                                  });
                                }}
                                data-testid={`voice-badge-ru-${idx}`}
                              >
                                {voice}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            
            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <Button
                variant="outline"
                onClick={handleBrowserPreview}
                className="flex-1"
                data-testid="button-browser-preview"
              >
                {isPlaying ? (
                  <>
                    <StopCircle className="h-4 w-4 mr-2" />
                    {t("tts.stop")}
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    {t("tts.preview")}
                  </>
                )}
              </Button>
              <Button
                onClick={handleCopyAll}
                className="flex-1"
                data-testid="button-copy-all"
              >
                {copiedAll ? (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    {t("tts.copied")}
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 mr-2" />
                    {t("voice.copyAll")}
                  </>
                )}
              </Button>
            </div>
          </TabsContent>
          
          <TabsContent value="phrases" className="space-y-4 mt-4">
            <div className="flex flex-wrap gap-2 mb-4">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyAll}
                data-testid="button-copy-full-text"
              >
                <Copy className="h-4 w-4 mr-1 sm:mr-2" />
                <span className="text-xs sm:text-sm">{t("voice.fullText")}</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyFormatted}
                data-testid="button-copy-numbered"
              >
                <Copy className="h-4 w-4 mr-1 sm:mr-2" />
                <span className="text-xs sm:text-sm">{t("voice.numbered")}</span>
              </Button>
            </div>
            
            <div className="space-y-2 max-h-[300px] sm:max-h-[400px] overflow-y-auto">
              {phrases.map((phrase, index) => (
                <div
                  key={index}
                  className="group flex items-start gap-2 p-2 sm:p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                >
                  <Badge variant="outline" className="shrink-0 mt-0.5 text-xs">
                    {index + 1}
                  </Badge>
                  <p className="flex-1 text-xs sm:text-sm leading-relaxed break-words">{phrase}</p>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                    onClick={() => handleCopyPhrase(phrase, index)}
                    data-testid={`button-copy-phrase-${index}`}
                  >
                    {copiedIndex === index ? (
                      <Check className="h-4 w-4 text-primary" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
            
            <p className="text-xs text-muted-foreground text-center pt-2">
              {t("voice.phraseCount").replace("{count}", String(phrases.length)).replace("{chars}", String(text.length))}
            </p>
          </TabsContent>
          
          <TabsContent value="services" className="space-y-4 mt-4">
            <p className="text-xs sm:text-sm text-muted-foreground">
              {t("voice.downloadHint")}
            </p>
            
            <div className="grid gap-2 sm:gap-3">
              {externalServices.map((service) => (
                <button
                  key={service.id}
                  onClick={() => handleOpenService(service.url)}
                  className="flex items-center gap-2 sm:gap-4 p-3 sm:p-4 rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors text-left border"
                  data-testid={`button-service-${service.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
                      <span className="font-semibold text-sm sm:text-base">{service.name}</span>
                      {service.supportsDownload && (
                        <Badge variant="default" className="text-xs">
                          <Download className="h-3 w-3 mr-1" />
                          MP3
                        </Badge>
                      )}
                      {service.supportsRussian && language === "ru" && (
                        <Badge variant="outline" className="text-xs">RU</Badge>
                      )}
                    </div>
                    <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 truncate">
                      {t(`voice.service.${service.id}`)}
                    </p>
                  </div>
                  <ExternalLink className="h-4 w-4 sm:h-5 sm:w-5 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </div>
            
            <div className="p-3 sm:p-4 rounded-lg bg-muted/50 border">
              <p className="text-xs sm:text-sm font-medium mb-1 sm:mb-2">
                {t("voice.tip")}
              </p>
              <p className="text-xs sm:text-sm text-muted-foreground">
                {t("voice.tipContent")
                  .replace("{style}", t(`voice.style.${currentStyle.id}`))
                  .replace("{voices}", currentStyle.recommendedVoices[language].slice(0, 2).join(", "))}
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
