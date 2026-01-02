import { Language, Platform, StylePreset, AccentPreset, Duration, TrendTopic } from "@shared/schema";

export const SYSTEM = `
Ты — сценарист вертикальных видео (Shorts/Reels/TikTok) + редактор.
ЖЁСТКОЕ ПРАВИЛО: запрещено копировать или близко перефразировать seedTitles.
seedTitles = SIGNAL (паттерн/угол/структура). contextSnippets = CONTEXT (смысл/факты).
Пиши коротко, энергично, монтажно. Никакой воды "в этом видео".
`;

export const SYSTEM_EN = `
You are a vertical video scriptwriter (Shorts/Reels/TikTok) + editor.
STRICT RULE: copying or closely paraphrasing seedTitles is forbidden.
seedTitles = SIGNAL (pattern/angle/structure). contextSnippets = CONTEXT (meaning/facts).
Write short, energetic, edit-friendly. No filler like "in this video".
`;

export interface PromptParams {
  language: Language;
  platform: Platform;
  durationSec: Duration;
  clusterLabel?: string;
  keywords?: string[];
  seedTitles: string[];
  contextSnippets: string[];
  styleName?: string;
  accentName?: string;
  goal?: string;
  audience?: string;
  frameStyle?: string;
  speakerLines?: string[];
}

function formatBullets(items: string[]): string {
  return items.map((item, i) => `${i + 1}. ${item}`).join("\n");
}

export function buildSeoTitlePrompt(params: PromptParams): string {
  const lang = params.language === "ru" ? "RU" : "EN";
  const charLimit = params.language === "ru" ? "45-70" : "40-65";
  
  return `
Язык: ${lang}. Платформа: ${params.platform}. Длительность: ${params.durationSec} сек.
Кластер/тема: ${params.clusterLabel || "general"}
Ключевые слова: ${params.keywords?.join(", ") || "N/A"}

SIGNAL seedTitles (НЕЛЬЗЯ копировать):
${formatBullets(params.seedTitles)}

CONTEXT contextSnippets (бери смысл и факты отсюда):
${formatBullets(params.contextSnippets)}

Сгенерируй 5 уникальных SEO-заголовков (${charLimit} символов).
Верни JSON:
{"titles":[{"text":"...","why":"...","keywords_used":["..."]}],"best_pick_index":0,"best_pick_reason":"..."}
`;
}

export function buildHookPrompt(params: PromptParams): string {
  return `
Язык: ${params.language}. Длительность: ${params.durationSec} сек. 
Стиль: ${params.styleName || "classic"}. Акцент: ${params.accentName || "classic"}
Ключевые слова: ${params.keywords?.join(", ") || "N/A"}

SIGNAL seedTitles (запрещено копировать):
${formatBullets(params.seedTitles)}

CONTEXT contextSnippets:
${formatBullets(params.contextSnippets)}

Сделай 3 хука: (1) вопрос (2) утверждение (3) контраст.
Запрет: вода и клише.
Верни JSON:
{"hooks":[{"text":"...","type":"question|statement|contrast","why":"..."}],"best_pick_index":0,"best_pick_reason":"..."}
`;
}

export function buildTranscriptRichPrompt(params: PromptParams): string {
  return `
Язык: ${params.language}. Платформа: ${params.platform}. Длительность: ${params.durationSec} сек.
Стиль: ${params.styleName || "classic"}. Акцент: ${params.accentName || "classic"}. 
Цель: ${params.goal || "engagement"}. ЦА: ${params.audience || "general"}
Ключевые слова: ${params.keywords?.join(", ") || "N/A"}

SIGNAL seedTitles (не копировать):
${formatBullets(params.seedTitles)}

CONTEXT contextSnippets (основа смысла):
${formatBullets(params.contextSnippets)}

Верни JSON строго:
{
  "speaker_lines": ["короткая фраза 1","..."],
  "cutaways": ["перебивка 1","..."],
  "onscreen_lines": ["текст на экране 1","..."],
  "notes": ["до 3 заметок"]
}
`;
}

export function buildTimelinePrompt(params: PromptParams & { speakerLines: string[] }): string {
  return `
Собери таймлайн по speaker_lines. Длительность: ${params.durationSec} сек.
INPUT speaker_lines:
${formatBullets(params.speakerLines)}

Сцены 2–6 сек, конец ≈ ${params.durationSec} (±5%).
Верни JSON:
{
 "scenes":[
  {"id":"S01","start":"00:00.000","end":"00:03.200","voText":"...",
   "onScreenText":["...","..."],
   "visualDescription":"...",
   "shot":{"type":"CU|MS|WS","motion":"static|pan|zoom|handheld"},
   "brollKeywords":["...","..."],
   "sfxMusicHint":"..."}
 ],
 "duration_check":{"target":${params.durationSec},"actual":0,"ok":true}
}
`;
}

export function buildFramePromptsPrompt(params: PromptParams): string {
  return `
Сгенерируй промпт кадра/превью (9:16) для каждой сцены по visualDescription+voText.
Стиль кадра: ${params.frameStyle || "cinematic"}. Верни JSON:
{"frames":[{"sceneId":"S01","prompt":"...","negative":"..."}]}
`;
}

export function buildSubtitlesPrompt(): string {
  return `
Сделай субтитры по сценам (voText+таймкоды). SRT/VTT/CSV/TSV.
Макс 42 символа на строку, 2 строки. Верни JSON:
{"srt":"...","vtt":"...","csv":"start,end,text\\n...","tsv":"start\\tend\\ttext\\n..."}
`;
}

export interface SeoTitleOption {
  text: string;
  why: string;
  keywords_used: string[];
}

export interface SeoTitleResult {
  titles: SeoTitleOption[];
  best_pick_index: number;
  best_pick_reason: string;
}

export interface HookOption {
  text: string;
  type: "question" | "statement" | "contrast";
  why: string;
}

export interface HookResult {
  hooks: HookOption[];
  best_pick_index: number;
  best_pick_reason: string;
}

export interface TranscriptRichResult {
  speaker_lines: string[];
  cutaways: string[];
  onscreen_lines: string[];
  notes: string[];
}

export interface TimelineScene {
  id: string;
  start: string;
  end: string;
  voText: string;
  onScreenText: string[];
  visualDescription: string;
  shot: {
    type: "CU" | "MS" | "WS";
    motion: "static" | "pan" | "zoom" | "handheld";
  };
  brollKeywords: string[];
  sfxMusicHint: string;
}

export interface TimelineResult {
  scenes: TimelineScene[];
  duration_check: {
    target: number;
    actual: number;
    ok: boolean;
  };
}

export interface FramePrompt {
  sceneId: string;
  prompt: string;
  negative: string;
}

export interface FramePromptsResult {
  frames: FramePrompt[];
}

export interface SubtitlesResult {
  srt: string;
  vtt: string;
  csv: string;
  tsv: string;
}

export interface ScriptPack {
  seoTitles: SeoTitleResult;
  hashtags: string[];
  hooks: HookResult;
  transcriptRich: TranscriptRichResult;
  timeline: TimelineResult;
  framePrompts: FramePromptsResult;
  subtitles: SubtitlesResult;
}

export function trendTopicToPromptParams(
  topic: TrendTopic,
  options: {
    language: Language;
    platform: Platform;
    durationSec: Duration;
    stylePreset?: StylePreset;
    accent?: AccentPreset;
    goal?: string;
    audience?: string;
  }
): PromptParams {
  return {
    language: options.language,
    platform: options.platform,
    durationSec: options.durationSec,
    clusterLabel: topic.clusterLabel,
    keywords: topic.keywords,
    seedTitles: topic.seedTitles,
    contextSnippets: topic.contextSnippets,
    styleName: options.stylePreset,
    accentName: options.accent,
    goal: options.goal,
    audience: options.audience,
  };
}

export function checkAntiCopy(text: string, seedTitles: string[]): { passed: boolean; reason?: string } {
  const textWords = text.toLowerCase().split(/\s+/).slice(0, 4).join(" ");
  
  for (const seedTitle of seedTitles) {
    const seedWords = seedTitle.toLowerCase().split(/\s+/).slice(0, 4).join(" ");
    
    if (textWords === seedWords) {
      return {
        passed: false,
        reason: `First 4 words match seedTitle: "${seedTitle}"`
      };
    }
  }
  
  return { passed: true };
}
