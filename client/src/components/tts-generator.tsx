import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
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
  Play,
  Pause,
  Copy,
  Volume2,
  StopCircle,
  Check
} from "lucide-react";

interface TTSGeneratorProps {
  text: string;
  language: "ru" | "en";
}

interface VoiceOption {
  voice: SpeechSynthesisVoice;
  label: string;
}

export function TTSGenerator({ text, language }: TTSGeneratorProps) {
  const { toast } = useToast();
  const { t } = useI18n();
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<string>("");
  const [rate, setRate] = useState(1.0);
  const [pitch, setPitch] = useState(1.0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [copied, setCopied] = useState(false);
  
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return;
    }

    const loadVoices = () => {
      const synth = window.speechSynthesis;
      if (!synth) return;
      
      const allVoices = synth.getVoices();
      const langCode = language === "ru" ? "ru" : "en";
      
      const filteredVoices: VoiceOption[] = allVoices
        .filter((voice) => voice.lang.startsWith(langCode))
        .map((voice) => ({
          voice,
          label: `${voice.name} (${voice.lang})`,
        }));

      if (filteredVoices.length === 0) {
        const anyVoices = allVoices.slice(0, 5).map((voice) => ({
          voice,
          label: `${voice.name} (${voice.lang})`,
        }));
        setVoices(anyVoices);
      } else {
        setVoices(filteredVoices);
      }
    };

    loadVoices();
    if (window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }

    return () => {
      if (window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = null;
        window.speechSynthesis.cancel();
      }
    };
  }, [language]);

  useEffect(() => {
    if (voices.length > 0 && !selectedVoice) {
      setSelectedVoice(voices[0].voice.name);
    }
  }, [voices, selectedVoice]);

  const getSelectedVoice = (): SpeechSynthesisVoice | undefined => {
    return voices.find((v) => v.voice.name === selectedVoice)?.voice;
  };

  const handlePlay = () => {
    if (!text.trim()) {
      toast({
        title: t("tts.noText"),
        description: t("tts.noTextDesc"),
        variant: "destructive",
      });
      return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    const voice = getSelectedVoice();
    if (voice) {
      utterance.voice = voice;
    }
    utterance.rate = rate;
    utterance.pitch = pitch;
    utterance.lang = language === "ru" ? "ru-RU" : "en-US";

    utterance.onstart = () => {
      setIsPlaying(true);
      setProgress(0);
    };

    utterance.onend = () => {
      setIsPlaying(false);
      setProgress(100);
    };

    utterance.onerror = () => {
      setIsPlaying(false);
      toast({
        title: t("common.error"),
        description: t("tts.playbackError"),
        variant: "destructive",
      });
    };

    utterance.onboundary = (event) => {
      const textLength = text.length;
      if (textLength > 0) {
        const currentProgress = (event.charIndex / textLength) * 100;
        setProgress(currentProgress);
      }
    };

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  };

  const handleStop = () => {
    window.speechSynthesis.cancel();
    setIsPlaying(false);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast({
        title: t("tts.copied"),
        description: t("tts.copiedDesc"),
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: t("common.error"),
        description: t("tts.copyError"),
        variant: "destructive",
      });
    }
  };

  const isSpeechSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  if (!isSpeechSupported) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Volume2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">{t("tts.notSupported")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Volume2 className="h-4 w-4" />
          {t("tts.title")}
        </CardTitle>
        <CardDescription>{t("tts.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid sm:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">{t("tts.voice")}</Label>
            <Select value={selectedVoice} onValueChange={setSelectedVoice}>
              <SelectTrigger data-testid="select-tts-voice">
                <SelectValue placeholder={t("tts.selectVoice")} />
              </SelectTrigger>
              <SelectContent>
                {voices.map((v) => (
                  <SelectItem key={v.voice.name} value={v.voice.name}>
                    {v.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">{t("tts.speed")}: {rate.toFixed(1)}x</Label>
            <input
              type="range"
              min="0.5"
              max="2"
              step="0.1"
              value={rate}
              onChange={(e) => setRate(parseFloat(e.target.value))}
              className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-muted"
              data-testid="slider-tts-rate"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">{t("tts.pitch")}: {pitch.toFixed(1)}</Label>
            <input
              type="range"
              min="0.5"
              max="2"
              step="0.1"
              value={pitch}
              onChange={(e) => setPitch(parseFloat(e.target.value))}
              className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-muted"
              data-testid="slider-tts-pitch"
            />
          </div>
        </div>

        {isPlaying && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{t("tts.playing")}</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {isPlaying ? (
            <Button
              variant="outline"
              onClick={handleStop}
              data-testid="button-tts-stop"
            >
              <StopCircle className="h-4 w-4 mr-2" />
              {t("tts.stop")}
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={handlePlay}
              disabled={!text.trim()}
              data-testid="button-tts-play"
            >
              <Play className="h-4 w-4 mr-2" />
              {t("tts.preview")}
            </Button>
          )}

          <Button
            variant="secondary"
            onClick={handleCopy}
            disabled={!text.trim()}
            data-testid="button-tts-copy"
          >
            {copied ? (
              <Check className="h-4 w-4 mr-2" />
            ) : (
              <Copy className="h-4 w-4 mr-2" />
            )}
            {t("tts.copyText")}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          {t("tts.hint")}
        </p>
      </CardContent>
    </Card>
  );
}
