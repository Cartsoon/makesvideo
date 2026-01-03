import type { Script, StoryboardScene, MusicConfig, StylePreset, Duration, Language, TopicInsights, Topic } from "@shared/schema";
import { storage } from "./storage";
import { getProvider } from "./ai/provider";

// Words per second for timing calculations (~2.5 words/sec for natural speech)
const WORDS_PER_SECOND = 2.5;

// Context object for content generation
export interface TopicContext {
  title: string;
  translatedTitle: string | null;
  fullContent: string | null;
  rawText: string | null;
  insights: TopicInsights | null;
  language: Language;
}

// Style preset templates for fallback generation
const styleTemplates: Record<StylePreset, { tone: string; vocabulary: string; structure: string }> = {
  news: {
    tone: "neutral, factual",
    vocabulary: "journalistic, objective",
    structure: "lead with key facts, supporting details"
  },
  crime: {
    tone: "suspenseful, thriller",
    vocabulary: "mystery terms, investigation language",
    structure: "clues → tension → revelation"
  },
  detective: {
    tone: "investigative, dramatic",
    vocabulary: "clues, deduction, reveal terminology",
    structure: "mystery → suspects → twist → resolution"
  },
  storytelling: {
    tone: "personal, emotional",
    vocabulary: "intimate narrative, relatable language",
    structure: "setup → conflict → transformation → lesson"
  },
  comedy: {
    tone: "humorous, punchy",
    vocabulary: "witty, comedic timing words",
    structure: "setup → punch → escalation → punchline"
  },
  classic: {
    tone: "timeless, balanced",
    vocabulary: "clear, universal",
    structure: "traditional narrative arc"
  },
  tarantino: {
    tone: "dialogue-driven, sarcastic",
    vocabulary: "sharp dialogue, cultural references",
    structure: "scene-based, unexpected cuts, tension"
  },
  anime: {
    tone: "dramatic, hyperbolic",
    vocabulary: "inner monologue, intense expressions",
    structure: "panels, escalating stakes, emotional peaks"
  },
  brainrot: {
    tone: "chaotic, fast-cut",
    vocabulary: "simple words, meme fragments, chaos",
    structure: "rapid thoughts, short bursts, random jumps"
  },
  adult: {
    tone: "subtle, suggestive",
    vocabulary: "flirty hints, tasteful innuendo",
    structure: "tease → build tension → implication"
  },
  howto: {
    tone: "instructional, clear",
    vocabulary: "step-by-step, actionable terms",
    structure: "problem → steps → result → tip"
  },
  mythbusting: {
    tone: "debunking, contrasting",
    vocabulary: "myth vs reality, fact-checking terms",
    structure: "myth stated → evidence → truth revealed"
  },
  top5: {
    tone: "countdown, suspenseful",
    vocabulary: "ranking language, superlatives",
    structure: "5 → 4 → 3 → 2 → 1 (best for last)"
  },
  hottakes: {
    tone: "provocative, bold",
    vocabulary: "controversial opinions, strong statements",
    structure: "hot take → evidence → challenge audience"
  },
  pov: {
    tone: "immersive, first-person",
    vocabulary: "scenario-based, you-focused",
    structure: "POV setup → situation → realization"
  },
  cinematic: {
    tone: "dramatic, visually rich",
    vocabulary: "descriptive, evocative language",
    structure: "slow build with visual emphasis"
  },
  science: {
    tone: "educational, simplified",
    vocabulary: "analogies, explanatory language",
    structure: "question → explanation → wow factor"
  },
  motivation: {
    tone: "inspirational, uplifting",
    vocabulary: "empowering words, call to action",
    structure: "challenge → perspective → motivation"
  },
  versus: {
    tone: "comparative, analytical",
    vocabulary: "pros/cons, comparison terms",
    structure: "option A vs option B → verdict"
  },
  mistake: {
    tone: "confessional, vulnerable",
    vocabulary: "honest reflection, lesson language",
    structure: "mistake → consequence → lesson learned"
  }
};

// Duration-based content length with story arc structure
const durationConfig: Record<Duration, { hookWords: number; scriptWords: number; scenes: number; arcStructure: string[] }> = {
  "30": { 
    hookWords: 10, 
    scriptWords: 60, 
    scenes: 4,
    arcStructure: ["Hook/Problem", "Context", "Solution", "CTA"]
  },
  "45": { 
    hookWords: 12, 
    scriptWords: 90, 
    scenes: 6,
    arcStructure: ["Hook/Problem", "Context", "Rising Action", "Climax", "Resolution", "CTA"]
  },
  "60": { 
    hookWords: 15, 
    scriptWords: 120, 
    scenes: 8,
    arcStructure: ["Hook/Problem", "Background", "Rising Action", "Conflict", "Climax", "Falling Action", "Resolution", "CTA"]
  },
  "120": { 
    hookWords: 25, 
    scriptWords: 240, 
    scenes: 14,
    arcStructure: ["Hook/Problem", "Background", "Context", "Rising Action 1", "Complication", "Rising Action 2", "Conflict", "Climax", "Twist", "Falling Action", "Resolution", "Lesson", "Callback", "CTA"]
  }
};

// ============ CONSTRAINTS CALCULATION ============
import type { ScriptConstraints, SeoOutputs, AccentPreset, Platform } from "@shared/schema";

const WPM_BY_LANGUAGE: Record<Language, { min: number; max: number }> = {
  ru: { min: 135, max: 155 },
  en: { min: 150, max: 170 }
};

const HOOK_MAX_WORDS: Record<Duration, [number, number]> = {
  "30": [12, 18],
  "45": [14, 22],
  "60": [18, 28],
  "120": [25, 40]
};

const SCENE_COUNT_RANGE: Record<Duration, [number, number]> = {
  "30": [5, 7],
  "45": [7, 9],
  "60": [8, 11],
  "120": [12, 18]
};

export function calculateConstraints(duration: Duration, language: Language): ScriptConstraints {
  const wpm = WPM_BY_LANGUAGE[language];
  const targetWpm = Math.round((wpm.min + wpm.max) / 2);
  const durationMin = parseInt(duration) / 60;
  const maxWordsVO = Math.round(durationMin * targetWpm);
  
  return {
    targetWpm,
    maxWordsVO,
    hookMaxWords: HOOK_MAX_WORDS[duration],
    sceneCountRange: SCENE_COUNT_RANGE[duration],
    onScreenTextMaxCharsPerScene: 52 // 2 lines * 26 chars
  };
}

// ============ SEO GENERATION INTERFACE ============

export interface SEOGenerationParams {
  topic: string;
  keywords: string[];
  language: Language;
  platform: Platform;
  stylePreset: StylePreset;
}

export interface LLMProvider {
  generateHook(topic: string, preset: StylePreset, duration: Duration, language: Language): Promise<string>;
  generateScript(topic: string, hook: string, preset: StylePreset, duration: Duration, language: Language): Promise<string>;
  generateStoryboard(script: string, preset: StylePreset, duration: Duration, language: Language): Promise<StoryboardScene[]>;
  
  // Context-aware generation methods
  generateHookFromContext(context: TopicContext, preset: StylePreset, duration: Duration): Promise<string>;
  generateScriptFromContext(context: TopicContext, hook: string, preset: StylePreset, duration: Duration): Promise<string>;
  generateStoryboardFromContext(context: TopicContext, script: string, preset: StylePreset, duration: Duration): Promise<StoryboardScene[]>;
  
  // SEO generation
  generateSEO(params: SEOGenerationParams): Promise<SeoOutputs>;
  
  // Headline generation
  generateHeadline(rawTitle: string, sourceName: string, language: Language): Promise<string>;
  
  // Translation and insights
  translateTitle(title: string, targetLanguage: Language): Promise<string>;
  extractInsights(content: string, language: Language): Promise<TopicInsights>;
  
  // Theses generation
  generateThesesFromContent(content: string, language: Language, count?: number): Promise<string[]>;
  generateThesesFromWeb(topic: string, language: Language, count?: number): Promise<string[]>;
  
  // Raw LLM call for custom generation
  generateRaw(systemPrompt: string, userPrompt: string, maxTokens?: number): Promise<string>;
}

export interface TTSProvider {
  generateVoice(text: string, preset: StylePreset): Promise<string | null>;
}

export interface MusicProvider {
  pickMusic(script: string, preset: StylePreset, duration: Duration): Promise<MusicConfig>;
}

// Unified LLM Provider that uses Replit AI Integrations (OpenAI)
export class UnifiedLLMProvider implements LLMProvider {
  private model: string;
  private fallback: FallbackLLMProvider;

  constructor() {
    this.model = process.env.AI_CHAT_MODEL ?? "gpt-4o-mini";
    this.fallback = new FallbackLLMProvider();
  }

  private async callLLM(systemPrompt: string, userPrompt: string, maxTokens: number = 1000): Promise<string> {
    try {
      const provider = getProvider();
      const result = await provider.chat({
        model: this.model,
        temperature: 0.7,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ]
      });
      
      console.log(`[UnifiedLLM] Generated ${result.length} chars with ${this.model}`);
      return result.trim();
    } catch (error) {
      console.error("[UnifiedLLM] Error:", error);
      throw error;
    }
  }

  async generateHeadline(rawTitle: string, sourceName: string, language: Language): Promise<string> {
    const systemPrompt = language === "ru"
      ? "Ты копирайтер для вирусных видео. Создай короткий цепляющий заголовок из исходного текста. Только заголовок, без кавычек и пояснений."
      : "You are a viral video copywriter. Create a short catchy headline from the source text. Only the headline, no quotes or explanations.";
    
    const userPrompt = `Source: ${sourceName}\nOriginal: ${rawTitle}`;
    
    try {
      return await this.callLLM(systemPrompt, userPrompt, 100);
    } catch {
      return rawTitle;
    }
  }

  async translateTitle(title: string, targetLanguage: Language): Promise<string> {
    const systemPrompt = targetLanguage === "ru"
      ? "Переведи заголовок на русский язык. Только перевод, без пояснений."
      : "Translate the headline to English. Only the translation, no explanations.";
    
    try {
      return await this.callLLM(systemPrompt, title, 200);
    } catch {
      return title;
    }
  }

  async extractInsights(content: string, language: Language): Promise<TopicInsights> {
    const systemPrompt = language === "ru"
      ? `Проанализируй статью и верни JSON с полями:
- keyFacts: массив 3-5 ключевых фактов
- trendingAngles: массив 2-3 трендовых углов подачи
- emotionalHooks: массив 2-3 эмоциональных крючков
- viralPotential: число от 1 до 100
- summary: краткое резюме в 2-3 предложениях
Только JSON, без markdown.`
      : `Analyze the article and return JSON with fields:
- keyFacts: array of 3-5 key facts
- trendingAngles: array of 2-3 trending angles
- emotionalHooks: array of 2-3 emotional hooks
- viralPotential: number from 1 to 100
- summary: brief summary in 2-3 sentences
Only JSON, no markdown.`;

    try {
      const result = await this.callLLM(systemPrompt, content.slice(0, 4000), 800);
      const cleaned = result.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      return JSON.parse(cleaned);
    } catch {
      return this.fallback.extractInsights(content, language);
    }
  }

  async generateHook(topic: string, preset: StylePreset, duration: Duration, language: Language): Promise<string> {
    const style = styleTemplates[preset];
    const systemPrompt = language === "ru"
      ? `Ты сценарист вирусных видео. Создай цепляющий хук для ${duration}-секундного видео.
Стиль: ${style.tone}, ${style.vocabulary}
Хук должен быть 5-10 слов, без кавычек.`
      : `You are a viral video scriptwriter. Create a catchy hook for a ${duration}-second video.
Style: ${style.tone}, ${style.vocabulary}
Hook should be 5-10 words, no quotes.`;

    try {
      return await this.callLLM(systemPrompt, `Topic: ${topic}`, 100);
    } catch {
      return this.fallback.generateHook(topic, preset, duration, language);
    }
  }

  async generateScript(topic: string, hook: string, preset: StylePreset, duration: Duration, language: Language): Promise<string> {
    const style = styleTemplates[preset];
    const config = durationConfig[duration];
    
    const systemPrompt = language === "ru"
      ? `Ты сценарист вирусных коротких видео. Напиши сценарий для ${duration}-секундного видео.
Стиль: ${style.tone}
Структура: ${config.arcStructure.join(" -> ")}

Формат "Закадровая История":
[Вставка: ВИЗУАЛЬНОЕ ОПИСАНИЕ]
*Голос: Текст закадрового голоса*
— "Прямая речь если есть"

Голос должен обсуждать ТЕМУ видео, а не повторять заголовок. Используй ${config.scriptWords} слов.`
      : `You are a viral short video scriptwriter. Write a script for a ${duration}-second video.
Style: ${style.tone}
Structure: ${config.arcStructure.join(" -> ")}

"Voiceover Story" format:
[Insert: VISUAL DESCRIPTION]
*Voice: Voiceover text*
— "Direct speech if any"

Voice should discuss the VIDEO TOPIC, not repeat the headline. Use ${config.scriptWords} words.`;

    try {
      return await this.callLLM(systemPrompt, `Topic: ${topic}\nHook: ${hook}`, 1500);
    } catch {
      return this.fallback.generateScript(topic, hook, preset, duration, language);
    }
  }

  async generateStoryboard(script: string, preset: StylePreset, duration: Duration, language: Language): Promise<StoryboardScene[]> {
    const config = durationConfig[duration];
    
    const systemPrompt = language === "ru"
      ? `Создай раскадровку для видео. Верни JSON массив из ${config.scenes} сцен. Каждая сцена:
{
  "sceneNumber": номер,
  "visual": "описание кадра",
  "onScreenText": "текст на экране 1-3 слова",
  "sfx": "звуковой эффект",
  "durationHint": "Xs",
  "stockKeywords": ["ключевое слово", "для поиска", "стока"],
  "aiPrompt": "промпт для AI генерации на английском"
}
Только JSON массив, без markdown.`
      : `Create a storyboard for the video. Return JSON array of ${config.scenes} scenes. Each scene:
{
  "sceneNumber": number,
  "visual": "shot description",
  "onScreenText": "on-screen text 1-3 words",
  "sfx": "sound effect",
  "durationHint": "Xs",
  "stockKeywords": ["keyword", "for stock", "search"],
  "aiPrompt": "prompt for AI video generation"
}
Only JSON array, no markdown.`;

    try {
      const result = await this.callLLM(systemPrompt, `Script:\n${script}`, 2000);
      const cleaned = result.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      return JSON.parse(cleaned);
    } catch {
      return this.fallback.generateStoryboard(script, preset, duration, language);
    }
  }

  async generateHookFromContext(context: TopicContext, preset: StylePreset, duration: Duration): Promise<string> {
    const language = context.language;
    const style = styleTemplates[preset];
    
    const systemPrompt = language === "ru"
      ? `Ты сценарист вирусных видео. Создай цепляющий хук для ${duration}-секундного видео на основе статьи.
Стиль: ${style.tone}, ${style.vocabulary}
Хук должен быть основан на СОДЕРЖАНИИ статьи, не повторять заголовок.
5-10 слов, без кавычек.`
      : `You are a viral video scriptwriter. Create a catchy hook for a ${duration}-second video based on the article.
Style: ${style.tone}, ${style.vocabulary}
Hook should be based on ARTICLE CONTENT, not repeat the headline.
5-10 words, no quotes.`;

    const userPrompt = `Title: ${context.title}
Key Facts: ${context.insights?.keyFacts?.join("; ") || "N/A"}
Emotional Hooks: ${context.insights?.emotionalHooks?.join("; ") || "N/A"}
Summary: ${context.insights?.summary || context.rawText?.slice(0, 500) || "N/A"}`;

    try {
      return await this.callLLM(systemPrompt, userPrompt, 100);
    } catch {
      return this.fallback.generateHookFromContext(context, preset, duration);
    }
  }

  async generateScriptFromContext(context: TopicContext, hook: string, preset: StylePreset, duration: Duration): Promise<string> {
    const language = context.language;
    const style = styleTemplates[preset];
    const config = durationConfig[duration];
    
    const systemPrompt = language === "ru"
      ? `Ты сценарист вирусных коротких видео. Напиши сценарий для ${duration}-секундного видео.
Стиль: ${style.tone}
Структура: ${config.arcStructure.join(" -> ")}

ВАЖНО: Сценарий должен РАССКАЗЫВАТЬ о содержании статьи, используя факты и детали.
НЕ повторяй заголовок. Расскажи историю на основе ключевых фактов.

Формат "Закадровая История":
[Вставка: ВИЗУАЛЬНОЕ ОПИСАНИЕ]
*Голос: Текст закадрового голоса*
— "Прямая речь если есть"

Используй ${config.scriptWords} слов.`
      : `You are a viral short video scriptwriter. Write a script for a ${duration}-second video.
Style: ${style.tone}
Structure: ${config.arcStructure.join(" -> ")}

IMPORTANT: Script should TELL the story from the article content, using facts and details.
DO NOT repeat the headline. Tell the story based on key facts.

"Voiceover Story" format:
[Insert: VISUAL DESCRIPTION]
*Voice: Voiceover text*
— "Direct speech if any"

Use ${config.scriptWords} words.`;

    const userPrompt = `Title: ${context.title}
Key Facts: ${context.insights?.keyFacts?.join("; ") || "N/A"}
Trending Angles: ${context.insights?.trendingAngles?.join("; ") || "N/A"}
Summary: ${context.insights?.summary || context.rawText?.slice(0, 1000) || "N/A"}
Hook to use: ${hook}`;

    try {
      return await this.callLLM(systemPrompt, userPrompt, 1500);
    } catch {
      return this.fallback.generateScriptFromContext(context, hook, preset, duration);
    }
  }

  async generateStoryboardFromContext(context: TopicContext, script: string, preset: StylePreset, duration: Duration): Promise<StoryboardScene[]> {
    const language = context.language;
    const config = durationConfig[duration];
    
    const systemPrompt = language === "ru"
      ? `Создай раскадровку для видео на основе сценария. Верни JSON массив из ${config.scenes} сцен.
Субтитры должны быть ключевыми словами из СОДЕРЖАНИЯ статьи (1-4 слова).
Каждая сцена:
{
  "sceneNumber": номер,
  "visual": "описание кадра",
  "onScreenText": "КЛЮЧЕВЫЕ СЛОВА из статьи",
  "sfx": "звуковой эффект",
  "durationHint": "Xs",
  "stockKeywords": ["ключевое слово", "для поиска", "стока"],
  "aiPrompt": "промпт для AI генерации на английском"
}
Только JSON массив.`
      : `Create a storyboard for the video based on the script. Return JSON array of ${config.scenes} scenes.
Subtitles should be key words from ARTICLE CONTENT (1-4 words).
Each scene:
{
  "sceneNumber": number,
  "visual": "shot description",
  "onScreenText": "KEY WORDS from article",
  "sfx": "sound effect",
  "durationHint": "Xs",
  "stockKeywords": ["keyword", "for stock", "search"],
  "aiPrompt": "prompt for AI video generation"
}
Only JSON array.`;

    const userPrompt = `Script:\n${script}\n\nKey Facts: ${context.insights?.keyFacts?.join("; ") || "N/A"}`;

    try {
      const result = await this.callLLM(systemPrompt, userPrompt, 2000);
      const cleaned = result.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      return JSON.parse(cleaned);
    } catch {
      return this.fallback.generateStoryboardFromContext(context, script, preset, duration);
    }
  }

  async generateThesesFromContent(content: string, language: Language, count: number = 3): Promise<string[]> {
    const systemPrompt = language === "ru"
      ? `Ты аналитик контента. Извлеки ${count} ключевых тезиса из статьи.
Каждый тезис должен быть:
- Коротким (5-15 слов)
- Фактическим и информативным
- Готовым для озвучки в видео
Верни только JSON массив строк. Без нумерации, без markdown.`
      : `You are a content analyst. Extract ${count} key theses from the article.
Each thesis should be:
- Short (5-15 words)
- Factual and informative
- Ready for video voiceover
Return only JSON array of strings. No numbering, no markdown.`;

    try {
      const result = await this.callLLM(systemPrompt, content.slice(0, 4000), 500);
      const cleaned = result.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      return JSON.parse(cleaned);
    } catch {
      return this.fallback.generateThesesFromContent(content, language, count);
    }
  }

  async generateThesesFromWeb(topic: string, language: Language, count: number = 3): Promise<string[]> {
    const systemPrompt = language === "ru"
      ? `Ты эксперт по трендам. Придумай ${count} популярных тезиса по теме для вирусного видео.
Каждый тезис должен быть:
- Коротким (5-15 слов)
- Трендовым и цепляющим
- Готовым для озвучки
Верни только JSON массив строк. Без нумерации, без markdown.`
      : `You are a trend expert. Create ${count} popular theses on the topic for viral video.
Each thesis should be:
- Short (5-15 words)
- Trendy and catchy
- Ready for voiceover
Return only JSON array of strings. No numbering, no markdown.`;

    try {
      const result = await this.callLLM(systemPrompt, `Topic: ${topic}`, 500);
      const cleaned = result.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      return JSON.parse(cleaned);
    } catch {
      return this.fallback.generateThesesFromWeb(topic, language, count);
    }
  }

  async generateSEO(params: SEOGenerationParams): Promise<SeoOutputs> {
    const { topic, keywords, language, platform, stylePreset } = params;
    const keywordsStr = keywords.length > 0 ? keywords.join(", ") : topic;
    
    const systemPrompt = language === "ru"
      ? `Ты SEO-специалист для YouTube Shorts/TikTok/Reels. Сгенерируй:
1. Три варианта SEO-заголовка (45-70 символов, ключ в начале, вирусно но без кликбейта-мусора)
2. 10 хештегов (8 по теме/нише + 2 широких популярных)

Формат JSON:
{
  "seoTitleOptions": ["Заголовок 1", "Заголовок 2", "Заголовок 3"],
  "seoTitle": "Лучший заголовок из трех",
  "hashtags": ["#хештег1", "#хештег2", ...]
}

Правила:
- Заголовки БЕЗ воды и клише типа "в этом видео"
- Хештеги без пробелов, на языке контента
- Платформа: ${platform}
- Стиль: ${stylePreset}`
      : `You are an SEO specialist for YouTube Shorts/TikTok/Reels. Generate:
1. Three SEO title options (45-70 characters, keyword at start, viral but no clickbait garbage)
2. 10 hashtags (8 niche-specific + 2 broad popular ones)

JSON format:
{
  "seoTitleOptions": ["Title 1", "Title 2", "Title 3"],
  "seoTitle": "Best title of the three",
  "hashtags": ["#hashtag1", "#hashtag2", ...]
}

Rules:
- Titles WITHOUT filler and cliches like "in this video"
- Hashtags without spaces, in content language
- Platform: ${platform}
- Style: ${stylePreset}`;

    const userPrompt = `Topic: ${topic}\nKeywords: ${keywordsStr}`;

    try {
      const result = await this.callLLM(systemPrompt, userPrompt, 800);
      const cleaned = result.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      return JSON.parse(cleaned);
    } catch {
      return this.fallback.generateSEO(params);
    }
  }

  async generateRaw(systemPrompt: string, userPrompt: string, maxTokens: number = 1000): Promise<string> {
    try {
      return await this.callLLM(systemPrompt, userPrompt, maxTokens);
    } catch (error) {
      console.error("[RealLLMProvider] generateRaw failed:", error);
      return this.fallback.generateRaw(systemPrompt, userPrompt, maxTokens);
    }
  }
}

// Stock video keywords by visual type
const stockKeywordsByVisual: Record<string, string[][]> = {
  // Cinematic
  "Wide establishing shot": [["aerial view", "landscape", "cityscape"], ["drone footage", "panoramic", "horizon"]],
  "Slow zoom in": [["focus", "detail", "close up"], ["reveal", "dramatic", "intensity"]],
  "Dramatic lighting": [["silhouette", "backlit", "golden hour"], ["shadow", "contrast", "moody"]],
  "Close-up detail": [["macro", "texture", "intricate"], ["focus", "detail shot", "extreme close up"]],
  "Pan across scene": [["slider shot", "movement", "cinematic pan"], ["reveal", "sweeping", "panoramic"]],
  "Silhouette shot": [["backlight", "shadow figure", "outline"], ["dramatic", "mystery", "contrast"]],
  "Time-lapse": [["time lapse", "clouds moving", "day to night"], ["fast motion", "passing time", "urban timelapse"]],
  "Final reveal": [["reveal shot", "dramatic reveal", "epic"], ["climax", "resolution", "conclusion"]],
  
  // Director
  "Master shot": [["wide shot", "establishing", "full scene"], ["overview", "context", "setting"]],
  "Medium two-shot": [["two people", "conversation", "dialogue"], ["interview", "discussion", "interaction"]],
  "Insert shot": [["detail", "cutaway", "focus object"], ["hands", "props", "relevant detail"]],
  "Over-the-shoulder": [["OTS", "perspective", "conversation"], ["listening", "dialogue", "reaction"]],
  "Tracking shot": [["following", "movement", "steadicam"], ["walking", "motion", "dynamic"]],
  "Static frame": [["still camera", "stable shot", "locked off"], ["composed", "symmetric", "balanced"]],
  "Dutch angle": [["tilted", "dynamic angle", "tension"], ["dramatic", "unsettling", "creative"]],
  "Pull-back reveal": [["zoom out", "wide reveal", "context"], ["bigger picture", "scale", "scope"]],
  
  // Meme
  "POV shot": [["first person", "POV", "perspective"], ["hands reaching", "looking at", "point of view"]],
  "Quick cut montage": [["fast cuts", "montage", "compilation"], ["rapid", "dynamic", "energy"]],
  "Reaction insert": [["reaction", "surprised face", "shocked"], ["expression", "emotion", "response"]],
  "Text overlay": [["text animation", "title card", "caption"], ["typography", "words", "message"]],
  "Split screen": [["comparison", "side by side", "before after"], ["versus", "contrast", "dual"]],
  "Zoom effect": [["punch in", "dramatic zoom", "impact"], ["emphasis", "highlight", "focus"]],
  "Green screen": [["chroma key", "background", "composite"], ["effects", "overlay", "replacement"]],
  "Freeze frame": [["pause", "still frame", "moment"], ["highlight", "emphasis", "frozen"]],
  
  // Trend
  "Hook shot": [["attention grabber", "opening", "intro"], ["hook", "teaser", "interest"]],
  "Fast cuts": [["quick editing", "dynamic", "energetic"], ["rapid", "pacing", "rhythm"]],
  "B-roll overlay": [["supplementary footage", "cutaway", "context"], ["supporting", "visual", "illustration"]],
  "Text animation": [["kinetic typography", "motion text", "animated words"], ["dynamic", "engaging", "modern"]],
  "Dynamic zoom": [["zoom burst", "impact", "emphasis"], ["energy", "highlight", "attention"]],
  "Transition effect": [["smooth transition", "creative wipe", "morph"], ["seamless", "flow", "connection"]],
  "CTA frame": [["call to action", "subscribe", "follow"], ["engagement", "button", "action"]],
  "Logo reveal": [["brand", "logo animation", "identity"], ["intro", "outro", "branding"]],
  
  // Classic
  "Opening frame": [["introduction", "title", "beginning"], ["start", "opening", "establish"]],
  "Subject introduction": [["present", "introduce", "show"], ["reveal", "display", "feature"]],
  "Supporting visual": [["illustration", "example", "support"], ["context", "evidence", "backup"]],
  "Example shot": [["demonstration", "how to", "tutorial"], ["showing", "example", "illustration"]],
  "Comparison frame": [["versus", "compare", "contrast"], ["side by side", "difference", "options"]],
  "Summary visual": [["recap", "summary", "key points"], ["overview", "conclusion", "takeaway"]],
  "Closing frame": [["ending", "conclusion", "finale"], ["wrap up", "final", "outro"]],
  "Call to action": [["CTA", "subscribe", "follow"], ["action", "engage", "next step"]],
  
  // News
  "Headline graphic": [["breaking news", "headline", "title card"], ["news graphic", "banner", "text"]],
  "Anchor shot": [["presenter", "reporter", "host"], ["speaking", "studio", "broadcast"]],
  "B-roll footage": [["news footage", "scene", "location"], ["event", "happening", "coverage"]],
  "Data visualization": [["chart", "graph", "statistics"], ["infographic", "data", "numbers"]],
  "Expert quote": [["interview", "expert", "talking head"], ["specialist", "authority", "opinion"]],
  "Map/location": [["map", "location", "geography"], ["place", "region", "area"]],
  "Summary card": [["key points", "summary", "bullet points"], ["takeaway", "facts", "recap"]],
  "Sign-off frame": [["outro", "credits", "end"], ["logo", "closing", "farewell"]]
};

// Free music suggestions by mood/genre
const freeMusicDatabase: Record<string, Array<{ name: string; artist: string; source: string; url?: string }>> = {
  "Epic, Emotional": [
    { name: "Epic Cinematic", artist: "Bensound", source: "Bensound", url: "https://www.bensound.com/royalty-free-music/track/epic" },
    { name: "Inspire", artist: "Bensound", source: "Bensound", url: "https://www.bensound.com/royalty-free-music/track/inspire" },
    { name: "Evolution", artist: "Benjamin Tissot", source: "Bensound" },
  ],
  "Professional, Clean": [
    { name: "Corporate", artist: "Bensound", source: "Bensound", url: "https://www.bensound.com/royalty-free-music/track/corporate" },
    { name: "The Elevator Bossa Nova", artist: "Bensound", source: "Bensound" },
    { name: "Acoustic Breeze", artist: "Bensound", source: "Bensound" },
  ],
  "Quirky, Playful": [
    { name: "Funky Suspense", artist: "Bensound", source: "Bensound" },
    { name: "Groovy Hip Hop", artist: "Bensound", source: "Bensound" },
    { name: "Retro Soul", artist: "Bensound", source: "Bensound" },
  ],
  "Energetic, Upbeat": [
    { name: "Ukulele", artist: "Bensound", source: "Bensound", url: "https://www.bensound.com/royalty-free-music/track/ukulele" },
    { name: "Happy Rock", artist: "Bensound", source: "Bensound" },
    { name: "Sunny", artist: "Bensound", source: "Bensound" },
    { name: "Summer", artist: "Bensound", source: "Bensound" },
  ],
  "Balanced, Neutral": [
    { name: "Memories", artist: "Bensound", source: "Bensound" },
    { name: "A New Beginning", artist: "Bensound", source: "Bensound" },
    { name: "Tenderness", artist: "Bensound", source: "Bensound" },
  ],
  "Serious, Trustworthy": [
    { name: "Tomorrow", artist: "Bensound", source: "Bensound" },
    { name: "The Jazz Piano", artist: "Bensound", source: "Bensound" },
    { name: "Slow Motion", artist: "Bensound", source: "Bensound" },
  ],
};

// SEO-optimized hook templates - standalone attention-grabbers without raw topic insertion
// These hooks create curiosity without depending on topic language
const hookTemplates: Record<StylePreset, Record<Language, string[]>> = {
  news: {
    en: [
      "BREAKING: Major developments you need to hear right now.",
      "Just in: Here are the facts in {duration}.",
      "UPDATE: What changed and why it matters to you.",
      "This just happened and everyone's talking about it."
    ],
    ru: [
      "СРОЧНО: Важные события которые нужно знать прямо сейчас.",
      "Только что: Факты за {duration}.",
      "ОБНОВЛЕНИЕ: Что изменилось и почему это важно для тебя.",
      "Это только что произошло и все об этом говорят."
    ]
  },
  crime: {
    en: [
      "The case that shocked investigators. Here's what they found.",
      "This crime went unsolved for years. Until now.",
      "The evidence was right there. Nobody noticed.",
      "A cold case just got reopened. Watch what happens."
    ],
    ru: [
      "Дело которое шокировало следователей. Вот что они нашли.",
      "Это преступление не раскрывали годами. До сих пор.",
      "Улика была прямо там. Никто не заметил.",
      "Холодное дело только что открыли заново."
    ]
  },
  detective: {
    en: [
      "The clues were scattered everywhere. Let me connect them.",
      "Something doesn't add up here. Watch closely.",
      "The suspect made one critical mistake.",
      "Every detail matters. Here's what I found."
    ],
    ru: [
      "Улики были разбросаны повсюду. Давай их соединим.",
      "Что-то здесь не сходится. Смотри внимательно.",
      "Подозреваемый допустил одну критическую ошибку.",
      "Каждая деталь важна. Вот что я нашёл."
    ]
  },
  storytelling: {
    en: [
      "I never thought this would happen to me. Here's my story.",
      "Let me tell you about the moment everything changed.",
      "This experience taught me something I'll never forget.",
      "I was wrong about everything. Here's what I learned."
    ],
    ru: [
      "Я никогда не думал что это случится со мной. Вот моя история.",
      "Расскажу о моменте когда всё изменилось.",
      "Этот опыт научил меня тому что я никогда не забуду.",
      "Я ошибался во всём. Вот чему я научился."
    ]
  },
  comedy: {
    en: [
      "Okay hear me out... this is actually hilarious.",
      "I can't be the only one who noticed this.",
      "Wait until you see the punchline.",
      "This is peak comedy and I can prove it."
    ],
    ru: [
      "Окей послушай... это реально смешно.",
      "Не может быть что только я это заметил.",
      "Подожди пока увидишь развязку.",
      "Это топ комедия и я могу это доказать."
    ]
  },
  classic: {
    en: [
      "Here's everything you need to know in just {duration}.",
      "Let me break this down in the simplest way possible.",
      "The complete {duration} guide you've been looking for.",
      "Learn in {duration} what took me years to figure out."
    ],
    ru: [
      "Всё что нужно знать за {duration}.",
      "Разберу это максимально просто.",
      "Полный гайд за {duration} который ты искал.",
      "Узнай за {duration} то на что у меня ушли годы."
    ]
  },
  tarantino: {
    en: [
      "Let me set the scene. This is where it gets interesting.",
      "You know what's funny about this situation?",
      "CUT TO: The moment everything went sideways.",
      "The dialogue here? Chef's kiss."
    ],
    ru: [
      "Давай обрисую сцену. Тут становится интересно.",
      "Знаешь что смешного в этой ситуации?",
      "ПЕРЕХОД: Момент когда всё пошло наперекосяк.",
      "Диалоги здесь? Шедевр."
    ]
  },
  anime: {
    en: [
      "NANI?! This changes everything!",
      "The power level here is over 9000.",
      "Main character moment incoming...",
      "This is my final form. Watch closely."
    ],
    ru: [
      "НАНИ?! Это меняет всё!",
      "Уровень силы здесь за 9000.",
      "Момент главного героя на подходе...",
      "Это моя финальная форма. Смотри внимательно."
    ]
  },
  brainrot: {
    en: [
      "bro WHAT even is this fr fr no cap",
      "okay but like... hear me out",
      "literally me when I saw this:",
      "the vibes are immaculate ngl"
    ],
    ru: [
      "бро ЧТО это вообще реально без кэпа",
      "окей но типа... послушай",
      "буквально я когда увидел это:",
      "вайбы безупречные нгл"
    ]
  },
  adult: {
    en: [
      "This one's for the grown-ups. You've been warned.",
      "Let's talk about what nobody else will...",
      "After dark content coming your way.",
      "The spicy take everyone's thinking but won't say."
    ],
    ru: [
      "Это для взрослых. Ты предупреждён.",
      "Поговорим о том о чём другие не скажут...",
      "Контент после полуночи летит к тебе.",
      "Острое мнение которое все думают но не скажут."
    ]
  },
  howto: {
    en: [
      "Here's how to do this in under {duration}.",
      "Step by step guide - save this for later.",
      "The exact process I use every time.",
      "Follow these steps and you can't fail."
    ],
    ru: [
      "Вот как это сделать за {duration}.",
      "Пошаговый гайд - сохрани на потом.",
      "Точный процесс который я использую каждый раз.",
      "Следуй этим шагам и не ошибёшься."
    ]
  },
  mythbusting: {
    en: [
      "Everyone believes this. They're all wrong.",
      "MYTH: What they told you. FACT: The truth.",
      "Time to destroy a popular misconception.",
      "You've been lied to. Here's the proof."
    ],
    ru: [
      "Все в это верят. И все ошибаются.",
      "МИФ: Что тебе говорили. ФАКТ: Правда.",
      "Пора разрушить популярное заблуждение.",
      "Тебя обманывали. Вот доказательство."
    ]
  },
  top5: {
    en: [
      "TOP 5 - and number 1 will shock you.",
      "Ranking from worst to best. Stay till the end.",
      "The countdown you didn't know you needed.",
      "Number 3 is criminally underrated."
    ],
    ru: [
      "ТОП 5 - и номер 1 тебя шокирует.",
      "Рейтинг от худшего к лучшему. Досмотри до конца.",
      "Обратный отсчёт который тебе был нужен.",
      "Номер 3 преступно недооценён."
    ]
  },
  hottakes: {
    en: [
      "Hot take: This is a RED FLAG.",
      "Unpopular opinion but I'm right.",
      "Nobody's ready for this conversation.",
      "I said what I said. Fight me."
    ],
    ru: [
      "Горячее мнение: Это РЕД ФЛАГ.",
      "Непопулярное мнение но я прав.",
      "Никто не готов к этому разговору.",
      "Я сказал что сказал. Спорьте."
    ]
  },
  pov: {
    en: [
      "POV: You just found out the truth.",
      "POV: This is happening to you right now.",
      "POV: The moment of realization hits.",
      "POV: You can't unsee this."
    ],
    ru: [
      "POV: Ты только что узнал правду.",
      "POV: Это происходит с тобой прямо сейчас.",
      "POV: Момент осознания настигает.",
      "POV: Это теперь не развидеть."
    ]
  },
  cinematic: {
    en: [
      "What you're about to see will change how you think forever.",
      "This is the story that nobody is talking about yet.",
      "In the next {duration}, everything you believed will be questioned.",
      "Some secrets are meant to be revealed. This is one of them."
    ],
    ru: [
      "То что ты сейчас увидишь изменит твоё мышление навсегда.",
      "Это история о которой пока никто не говорит.",
      "За следующие {duration} всё во что ты верил будет под вопросом.",
      "Некоторые секреты должны быть раскрыты. Это один из них."
    ]
  },
  science: {
    en: [
      "Science just explained something incredible.",
      "Here's how this actually works - simplified.",
      "The scientific reason behind this will blow your mind.",
      "Let me explain this like you're 5."
    ],
    ru: [
      "Наука только что объяснила нечто невероятное.",
      "Вот как это работает на самом деле - просто.",
      "Научная причина этого взорвёт твой мозг.",
      "Объясню это как будто тебе 5 лет."
    ]
  },
  motivation: {
    en: [
      "This is your sign to keep going.",
      "The mindset shift that changed everything for me.",
      "Stop scrolling. You need to hear this.",
      "This is why you're going to make it."
    ],
    ru: [
      "Это твой знак продолжать.",
      "Смена мышления которая изменила для меня всё.",
      "Перестань листать. Тебе нужно это услышать.",
      "Вот почему у тебя всё получится."
    ]
  },
  versus: {
    en: [
      "A vs B - which one actually wins?",
      "The comparison everyone's been waiting for.",
      "Let's settle this debate once and for all.",
      "One of these is clearly better. Here's which."
    ],
    ru: [
      "A против B - кто реально побеждает?",
      "Сравнение которого все ждали.",
      "Давай закроем этот спор раз и навсегда.",
      "Одно из этого явно лучше. Вот какое."
    ]
  },
  mistake: {
    en: [
      "I made this mistake so you don't have to.",
      "The one thing I wish I knew before.",
      "Learn from my failure. Here's what went wrong.",
      "I was wrong. Here's what I should have done."
    ],
    ru: [
      "Я совершил эту ошибку чтобы тебе не пришлось.",
      "Одна вещь которую я хотел бы знать раньше.",
      "Учись на моей неудаче. Вот что пошло не так.",
      "Я ошибся. Вот что я должен был сделать."
    ]
  }
};

// Duration formatter for natural language
const formatDuration = (duration: Duration, language: Language): string => {
  const seconds = parseInt(duration);
  if (language === "ru") {
    return `${seconds} секунд`;
  }
  return `${seconds} seconds`;
};

// VOICEOVER STORY FORMAT - "Закадровая История"
// Professional voiceover script format for video editing
// Structure: [Начало видеоряда], *Голос:, [Вставка], [Финал]
// Target: ~75 words for 30s, ~112 words for 45s, ~150 words for 60s
const scriptTemplates: Record<StylePreset, Record<Language, (topic: string, hook: string, duration: Duration) => string>> = {
  cinematic: {
    en: (topic, hook, duration) => {
      const seconds = parseInt(duration);
      if (seconds === 30) {
        return `[Video Start]
*Voice:
— A story that demands attention.

[Insert] — visual hook

*Voice:
— ${topic} hides something that changes everything.
— Look closer. Every detail leads somewhere.

[Insert] — key moment

*Voice:
— This is the truth you weren't supposed to see.

[Finale]
*Voice:
— Now you know. Follow for more.`;
      } else if (seconds === 45) {
        return `[Video Start]
*Voice:
— This isn't just another story.
— Something important is happening.

[Insert] — atmosphere shot

*Voice:
— ${topic} has been hiding in plain sight.
— Behind the surface lies something deeper.
— Something most people never notice.

[Insert] — tension builds

*Voice:
— Watch carefully.
— The pieces are falling into place.

[Insert] — reveal

*Voice:
— Now you see what was always there.

[Finale]
*Voice:
— This is just the beginning. Follow for more revelations.`;
      } else {
        return `[Video Start]
*Voice:
— Some stories demand to be told.
— This is one of them.

[Insert] — wide establishing shot

*Voice:
— ${topic} waited for the right moment.
— For someone to finally understand.
— Today that someone is you.

[Insert] — deep immersion

*Voice:
— Every frame tells a story.
— Every detail matters more than you think.
— Nothing here is random.

[Insert] — rising tension

*Voice:
— The truth is closer than it seems.
— Can you feel it building?

[Insert] — climax moment

*Voice:
— And there it is.
— Everything you thought you knew just changed.

[Finale]
*Voice:
— ${topic} will never look the same again.
— The journey continues. Follow.`;
      }
    },
    ru: (topic, hook, duration) => {
      const seconds = parseInt(duration);
      if (seconds === 30) {
        return `[Начало видеоряда]
*Голос:
— История, которая требует внимания.

[Вставка] — визуальный крючок

*Голос:
— ${topic} скрывает то, что меняет всё.
— Смотри внимательнее. Каждая деталь ведёт куда-то.

[Вставка] — ключевой момент

*Голос:
— Вот правда, которую ты не должен был видеть.

[Финал]
*Голос:
— Теперь ты знаешь. Подписывайся.`;
      } else if (seconds === 45) {
        return `[Начало видеоряда]
*Голос:
— Это не просто очередная история.
— Происходит что-то важное.

[Вставка] — атмосферный кадр

*Голос:
— ${topic} всё время был на виду.
— Под поверхностью скрывается нечто большее.
— То, что большинство никогда не замечает.

[Вставка] — нарастает напряжение

*Голос:
— Смотри внимательно.
— Кусочки складываются.

[Вставка] — раскрытие

*Голос:
— Теперь ты видишь то, что было всегда.

[Финал]
*Голос:
— Это только начало. Подписывайся на продолжение.`;
      } else {
        return `[Начало видеоряда]
*Голос:
— Некоторые истории требуют чтобы их рассказали.
— Эта — одна из них.

[Вставка] — широкий общий план

*Голос:
— ${topic} ждал подходящего момента.
— Ждал того, кто наконец поймёт.
— Сегодня этот кто-то — ты.

[Вставка] — глубокое погружение

*Голос:
— Каждый кадр рассказывает историю.
— Каждая деталь важнее, чем кажется.
— Здесь нет ничего случайного.

[Вставка] — нарастающее напряжение

*Голос:
— Правда ближе, чем кажется.
— Чувствуешь, как нарастает?

[Вставка] — кульминация

*Голос:
— И вот оно.
— Всё, что ты думал, что знал — изменилось.

[Финал]
*Голос:
— ${topic} больше никогда не будет прежним.
— Путешествие продолжается. Подписывайся.`;
      }
    }
  },
  director: {
    en: (topic, hook, duration) => {
      const seconds = parseInt(duration);
      if (seconds === 30) {
        return `[Video Start]
*Voice:
— Let me show you something.

[Insert] — wide establishing shot

*Voice:
— Scene one. ${topic} from a director's eye.
— Push in slowly on the key element.

[Insert] — detail shot

*Voice:
— This is what matters. Hold on the moment.

[Finale]
*Voice:
— That's a wrap. Follow for more.`;
      } else if (seconds === 45) {
        return `[Video Start]
*Voice:
— Let me show you how I see ${topic}.
— Every frame matters.

[Insert] — master shot

*Voice:
— First, the full picture.
— Every choice tells a story.

[Insert] — tight shot

*Voice:
— Now we go in close.
— The details reveal the truth.

[Insert] — over the shoulder

*Voice:
— Personal. Intimate. Real.

[Finale]
*Voice:
— ${topic} framed exactly as intended.
— That's the art. Follow for more.`;
      } else {
        return `[Video Start]
*Voice:
— Complete scene breakdown for ${topic}.
— Watch how it all comes together.

[Insert] — establishing shot

*Voice:
— Set the world first.
— Let it breathe.

[Insert] — medium shot

*Voice:
— Introduce the subject properly.
— Movement builds momentum.

[Insert] — insert shot

*Voice:
— The crucial detail.
— This changes everything.

[Insert] — tension shot

*Voice:
— Something is shifting.
— Hold that feeling.

[Insert] — climactic reveal

*Voice:
— The moment we've been building toward.
— There it is.

[Finale]
*Voice:
— Every element placed with intention.
— This is visual storytelling. Follow.`;
      }
    },
    ru: (topic, hook, duration) => {
      const seconds = parseInt(duration);
      if (seconds === 30) {
        return `[Начало видеоряда]
*Голос:
— Покажу кое-что интересное.

[Вставка] — широкий план

*Голос:
— Сцена первая. ${topic} глазами режиссёра.
— Медленный наезд на ключевой элемент.

[Вставка] — деталь

*Голос:
— Вот что важно. Держим момент.

[Финал]
*Голос:
— Снято. Подписывайся.`;
      } else if (seconds === 45) {
        return `[Начало видеоряда]
*Голос:
— Покажу как я вижу ${topic}.
— Каждый кадр имеет значение.

[Вставка] — общий план

*Голос:
— Сначала полная картина.
— Каждый выбор рассказывает историю.

[Вставка] — крупный план

*Голос:
— Теперь идём ближе.
— Детали раскрывают правду.

[Вставка] — через плечо

*Голос:
— Лично. Интимно. По-настоящему.

[Финал]
*Голос:
— ${topic} в кадре именно так, как задумано.
— Вот это искусство. Подписывайся.`;
      } else {
        return `[Начало видеоряда]
*Голос:
— Полный разбор сцены для ${topic}.
— Смотри как всё складывается.

[Вставка] — устанавливающий кадр

*Голос:
— Сначала создаём мир.
— Даём ему подышать.

[Вставка] — средний план

*Голос:
— Представляем объект правильно.
— Движение создаёт темп.

[Вставка] — вставка-деталь

*Голос:
— Ключевая деталь.
— Это меняет всё.

[Вставка] — напряжённый кадр

*Голос:
— Что-то меняется.
— Держим это ощущение.

[Вставка] — кульминация

*Голос:
— Момент к которому мы шли.
— Вот оно.

[Финал]
*Голос:
— Каждый элемент размещён с намерением.
— Это визуальный сторителлинг. Подписывайся.`;
      }
    }
  },
  meme: {
    en: (topic, hook, duration) => {
      const seconds = parseInt(duration);
      if (seconds === 30) {
        return `[Video Start]
*Voice:
— Okay but hear me out.

[Insert] — reaction shot

*Voice:
— ${topic} hits different. No cap.
— Wait for it...

[Insert] — the moment

*Voice:
— AND BOOM. That's the one.

[Finale]
*Voice:
— You're welcome. Follow.`;
      } else if (seconds === 45) {
        return `[Video Start]
*Voice:
— Hear me out for a sec.
— This is gonna be good.

[Insert] — setup

*Voice:
— ${topic} is peak content.
— The vibes? Immaculate.

[Insert] — build up

*Voice:
— It just hits different.
— When you finally get it...

[Insert] — payoff

*Voice:
— Chef's kiss. Perfection.

[Finale]
*Voice:
— If you know, you know.
— Follow for more chaos.`;
      } else {
        return `[Video Start]
*Voice:
— Buckle up for this one.
— It's gonna be wild.

[Insert] — intro

*Voice:
— ${topic} is about to change your life.
— In a good way. Probably.

[Insert] — explanation

*Voice:
— It hits different when you think about it.
— Main character energy for real.

[Insert] — twist

*Voice:
— Plot twist nobody saw coming?
— It was inside you all along.

[Insert] — realization

*Voice:
— You were the ${topic} we needed.

[Finale]
*Voice:
— Share with someone who needs this.
— Follow for absolute chaos.`;
      }
    },
    ru: (topic, hook, duration) => {
      const seconds = parseInt(duration);
      if (seconds === 30) {
        return `[Начало видеоряда]
*Голос:
— Окей но послушай.

[Вставка] — реакция

*Голос:
— ${topic} заходит по-другому. Без кэпа.
— Подожди...

[Вставка] — момент

*Голос:
— И БАЦ. Вот оно.

[Финал]
*Голос:
— Пожалуйста. Подписывайся.`;
      } else if (seconds === 45) {
        return `[Начало видеоряда]
*Голос:
— Послушай секунду.
— Сейчас будет хорошо.

[Вставка] — сетап

*Голос:
— ${topic} это топ контент.
— Вайбы? Безупречные.

[Вставка] — нарастание

*Голос:
— Просто по-другому заходит.
— Когда наконец догоняешь...

[Вставка] — развязка

*Голос:
— Шефс кисс. Идеал.

[Финал]
*Голос:
— Кто понял — тот понял.
— Подписка на хаос.`;
      } else {
        return `[Начало видеоряда]
*Голос:
— Пристегнись к этому.
— Сейчас будет дико.

[Вставка] — интро

*Голос:
— ${topic} сейчас изменит твою жизнь.
— В хорошем смысле. Наверное.

[Вставка] — объяснение

*Голос:
— По-другому заходит когда думаешь.
— Энергия главного героя реально.

[Вставка] — твист

*Голос:
— Поворот которого никто не ждал?
— Это было в тебе всё время.

[Вставка] — осознание

*Голос:
— Ты и был тем самым ${topic}.

[Финал]
*Голос:
— Скинь тому, кому надо.
— Подписка на абсолютный хаос.`;
      }
    }
  },
  trend: {
    en: (topic, hook, duration) => {
      const seconds = parseInt(duration);
      if (seconds === 30) {
        return `[Video Start]
*Voice:
— This trend is everywhere.

[Insert] — trend intro

*Voice:
— The ${topic} trend everyone's doing right now.
— Step one. Watch closely.

[Insert] — the moment

*Voice:
— Step two. Mind blown.

[Finale]
*Voice:
— This is why it's viral. Share and follow.`;
      } else if (seconds === 45) {
        return `[Video Start]
*Voice:
— This ${topic} trend is EVERYWHERE.
— And you need to see why.

[Insert] — setup

*Voice:
— First the hook that gets everyone.
— Nobody sees this twist coming.

[Insert] — twist

*Voice:
— And then... the payoff.
— Comments explode every time.

[Insert] — reaction

*Voice:
— People are losing it over this.

[Finale]
*Voice:
— Don't miss this moment.
— Try it yourself. Follow for more.`;
      } else {
        return `[Video Start]
*Voice:
— The ${topic} trend fully explained.
— From start to finish.

[Insert] — origin

*Voice:
— It started when someone discovered one thing.
— Then the internet did its thing.

[Insert] — evolution

*Voice:
— People added their own spin.
— The duets? Fire.
— The stitches? Even better.

[Insert] — spread

*Voice:
— Now it's on everyone's feed.
— No matter where you are.

[Insert] — how to

*Voice:
— Here's how to nail it yourself.
— Do THIS one thing.

[Finale]
*Voice:
— The algorithm loves this.
— Share it. Follow for trends.`;
      }
    },
    ru: (topic, hook, duration) => {
      const seconds = parseInt(duration);
      if (seconds === 30) {
        return `[Начало видеоряда]
*Голос:
— Этот тренд везде.

[Вставка] — интро тренда

*Голос:
— Тренд ${topic} который делают все.
— Шаг первый. Смотри внимательно.

[Вставка] — момент

*Голос:
— Шаг второй. Мозг взорван.

[Финал]
*Голос:
— Вот почему вирусится. Шарь и подписывайся.`;
      } else if (seconds === 45) {
        return `[Начало видеоряда]
*Голос:
— Тренд ${topic} буквально ВЕЗДЕ.
— И вот почему ты должен это видеть.

[Вставка] — сетап

*Голос:
— Сначала хук который цепляет всех.
— Никто не ждёт этот поворот.

[Вставка] — поворот

*Голос:
— А потом... развязка.
— Комменты рвутся каждый раз.

[Вставка] — реакция

*Голос:
— Люди теряют рассудок от этого.

[Финал]
*Голос:
— Не упусти момент.
— Попробуй сам. Подписывайся.`;
      } else {
        return `[Начало видеоряда]
*Голос:
— Тренд ${topic} полностью объяснённый.
— От начала до конца.

[Вставка] — начало

*Голос:
— Началось когда кто-то открыл одну вещь.
— А потом интернет сделал своё.

[Вставка] — развитие

*Голос:
— Люди добавили свой стиль.
— Дуэты? Огонь.
— Стичи? Ещё круче.

[Вставка] — распространение

*Голос:
— Теперь это в рекомендациях у всех.
— Неважно где ты.

[Вставка] — как сделать

*Голос:
— Вот как повторить самому.
— Сделай ЭТО одно действие.

[Финал]
*Голос:
— Алгоритм любит это.
— Шарь. Подписывайся на тренды.`;
      }
    }
  },
  classic: {
    en: (topic, hook, duration) => {
      const seconds = parseInt(duration);
      if (seconds === 30) {
        return `[Video Start]
*Voice:
— Let me break this down.

[Insert] — concept intro

*Voice:
— ${topic} broken down simply.
— First, the core concept.

[Insert] — application

*Voice:
— Second, how it applies to you.

[Finale]
*Voice:
— Now you know. Save this. Follow.`;
      } else if (seconds === 45) {
        return `[Video Start]
*Voice:
— Let me explain ${topic} clearly.
— In a way that actually makes sense.

[Insert] — basics

*Voice:
— The basics: What it actually means.
— Why so many get this wrong.

[Insert] — application

*Voice:
— The application: How to use this daily.
— Real situations you face.

[Insert] — takeaway

*Voice:
— The takeaway: Why it matters to you.

[Finale]
*Voice:
— Save for reference. Follow for more.`;
      } else {
        return `[Video Start]
*Voice:
— Complete guide to ${topic}.
— Everything you need to know.

[Insert] — foundation

*Voice:
— First, the foundation.
— Key principles that make it work.

[Insert] — interesting part

*Voice:
— Here's where it gets interesting.
— Applications are everywhere.

[Insert] — example one

*Voice:
— A real example.
— See how it works?

[Insert] — example two

*Voice:
— Another angle.
— Same principle, different view.

[Insert] — conclusion

*Voice:
— Bottom line: Everyone should understand this.
— It gives you an advantage.

[Finale]
*Voice:
— Save for reference.
— Follow for educational content.`;
      }
    },
    ru: (topic, hook, duration) => {
      const seconds = parseInt(duration);
      if (seconds === 30) {
        return `[Начало видеоряда]
*Голос:
— Давай разберём.

[Вставка] — интро концепции

*Голос:
— ${topic} простыми словами.
— Сначала основа.

[Вставка] — применение

*Голос:
— Второе, как это касается тебя.

[Финал]
*Голос:
— Теперь знаешь. Сохрани. Подписывайся.`;
      } else if (seconds === 45) {
        return `[Начало видеоряда]
*Голос:
— Объясню ${topic} понятно.
— Так чтобы реально понял.

[Вставка] — основы

*Голос:
— Основы: Что это на самом деле значит.
— Почему многие ошибаются.

[Вставка] — применение

*Голос:
— Применение: Как использовать каждый день.
— Реальные ситуации.

[Вставка] — вывод

*Голос:
— Вывод: Почему это важно для тебя.

[Финал]
*Голос:
— Сохрани. Подписывайся.`;
      } else {
        return `[Начало видеоряда]
*Голос:
— Полный гайд по ${topic}.
— Всё что нужно знать.

[Вставка] — фундамент

*Голос:
— Сначала фундамент.
— Ключевые принципы.

[Вставка] — интересное

*Голос:
— Вот где становится интересно.
— Применения повсюду.

[Вставка] — пример один

*Голос:
— Реальный пример.
— Видишь как работает?

[Вставка] — пример два

*Голос:
— Другой угол.
— Тот же принцип, другой взгляд.

[Вставка] — итог

*Голос:
— Суть: Каждый должен это понимать.
— Это даёт преимущество.

[Финал]
*Голос:
— Сохрани для справки.
— Подписывайся на обучающий контент.`;
      }
    }
  },
  news: {
    en: (topic, hook, duration) => {
      const seconds = parseInt(duration);
      if (seconds === 30) {
        return `[Video Start]
*Voice:
— Breaking story.

[Insert] — breaking graphic

*Voice:
— ${topic} just made headlines.
— Here's what this means for you.

[Insert] — key fact

*Voice:
— The implications are bigger than you think.

[Finale]
*Voice:
— Stay informed. Follow for updates.`;
      } else if (seconds === 45) {
        return `[Video Start]
*Voice:
— Everything we know about ${topic} right now.
— The story is developing.

[Insert] — the event

*Voice:
— What happened: The story step by step.
— Everyone's attention is on this.

[Insert] — the impact

*Voice:
— Who's affected and how.
— Things are changing.

[Insert] — the outlook

*Voice:
— What experts are saying.
— Predictions for what's next.

[Finale]
*Voice:
— More updates as we learn more.
— Follow for breaking news.`;
      } else {
        return `[Video Start]
*Voice:
— Full breakdown of ${topic}.
— All the details you need.

[Insert] — the story

*Voice:
— What led to this moment.
— Key events along the way.

[Insert] — the facts

*Voice:
— Confirmed information only.
— From reliable sources.

[Insert] — the reaction

*Voice:
— How people are responding.
— What they're saying.

[Insert] — expert analysis

*Voice:
— What this could mean going forward.
— Specialists are watching closely.

[Insert] — bigger picture

*Voice:
— ${topic} in context.
— Why it matters beyond headlines.

[Insert] — what's next

*Voice:
— Key developments to watch.
— The story continues.

[Finale]
*Voice:
— We'll keep you updated.
— Follow for the latest.`;
      }
    },
    ru: (topic, hook, duration) => {
      const seconds = parseInt(duration);
      if (seconds === 30) {
        return `[Начало видеоряда]
*Голос:
— Срочная новость.

[Вставка] — срочная плашка

*Голос:
— ${topic} попал в заголовки.
— Вот что это значит для тебя.

[Вставка] — ключевой факт

*Голос:
— Последствия серьёзнее, чем кажется.

[Финал]
*Голос:
— Будь в курсе. Подписывайся.`;
      } else if (seconds === 45) {
        return `[Начало видеоряда]
*Голос:
— Всё что известно о ${topic} прямо сейчас.
— История развивается.

[Вставка] — событие

*Голос:
— Что произошло: История шаг за шагом.
— Все внимание на этом.

[Вставка] — влияние

*Голос:
— Кого затрагивает и как.
— Ситуация меняется.

[Вставка] — прогноз

*Голос:
— Что говорят эксперты.
— Предсказания на будущее.

[Финал]
*Голос:
— Обновления по мере поступления.
— Подписывайся на срочные новости.`;
      } else {
        return `[Начало видеоряда]
*Голос:
— Полный разбор ${topic}.
— Все детали которые нужно знать.

[Вставка] — история

*Голос:
— Что привело к этому моменту.
— Ключевые события.

[Вставка] — факты

*Голос:
— Только подтверждённая информация.
— Из надёжных источников.

[Вставка] — реакция

*Голос:
— Как люди реагируют.
— Что говорят.

[Вставка] — анализ экспертов

*Голос:
— Что это может значить дальше.
— Специалисты следят внимательно.

[Вставка] — общая картина

*Голос:
— ${topic} в контексте.
— Почему это важно.

[Вставка] — что дальше

*Голос:
— За чем следить.
— История продолжается.

[Финал]
*Голос:
— Будем держать в курсе.
— Подписывайся на новости.`;
      }
    }
  }
};

// AI prompt templates for video generation (for use with AI video generators)
const aiPromptTemplates: Record<StylePreset, Record<Language, string[]>> = {
  news: {
    en: ["News broadcast style, professional anchor framing, studio lighting", "B-roll footage, documentary style, location establishing shot", "Data visualization, infographic overlay, news graphics style", "Expert interview frame, lower third graphics, broadcast quality"],
    ru: ["Стиль новостного выпуска, профессиональный кадр ведущего, студийный свет", "B-roll материал, документальный стиль, устанавливающий кадр локации", "Визуализация данных, инфографика, стиль новостной графики", "Кадр интервью эксперта, нижняя плашка, качество трансляции"]
  },
  crime: {
    en: ["Dark alley shot, noir lighting, mystery atmosphere, shadows", "Evidence close-up, investigation scene, tension building", "Suspect silhouette, dramatic backlight, thriller mood", "Crime scene tape, investigation footage, documentary style"],
    ru: ["Тёмный переулок, нуар освещение, атмосфера тайны, тени", "Крупный план улики, сцена расследования, нарастание напряжения", "Силуэт подозреваемого, драматичная подсветка, триллер", "Криминальная сцена, расследование, документальный стиль"]
  },
  detective: {
    en: ["Magnifying glass detail shot, investigation atmosphere, clue reveal", "Evidence board close-up, connected threads, mystery solving", "Dramatic reveal shot, spotlight on evidence, tension", "Detective POV, searching scene, noir aesthetic"],
    ru: ["Детальный кадр с лупой, атмосфера расследования, раскрытие улики", "Крупный план доски с уликами, связанные нити, разгадка", "Драматичное раскрытие, свет на улике, напряжение", "POV детектива, осмотр сцены, нуар эстетика"]
  },
  storytelling: {
    en: ["Personal moment shot, intimate lighting, emotional depth", "Journey montage, life moments, nostalgic filter", "Reflection shot, mirror or water, introspective mood", "Transformation reveal, before and after, emotional arc"],
    ru: ["Личный момент, интимное освещение, эмоциональная глубина", "Монтаж путешествия, моменты жизни, ностальгический фильтр", "Кадр отражения, зеркало или вода, интроспекция", "Раскрытие трансформации, до и после, эмоциональная арка"]
  },
  comedy: {
    en: ["Comedic reaction shot, exaggerated expression, bright lighting", "Setup and punchline visual, timing emphasis, playful", "Physical comedy moment, dynamic movement, humor", "Awkward pause shot, deadpan delivery, comedic timing"],
    ru: ["Комедийная реакция, преувеличенное выражение, яркий свет", "Визуальный сетап и панч, акцент на тайминге, игривый", "Момент физической комедии, динамичное движение, юмор", "Неловкая пауза, подача дедпэн, комедийный тайминг"]
  },
  classic: {
    en: ["Clean educational frame, well-lit subject, neutral background, clear composition", "Demonstration shot, step by step visual, instructional format", "Example illustration, clear graphics, informative style", "Summary frame, key points visible, professional presentation"],
    ru: ["Чистый образовательный кадр, хорошо освещённый объект, нейтральный фон", "Демонстрационный кадр, пошаговый визуал, инструкционный формат", "Иллюстрация примера, чёткая графика, информативный стиль", "Кадр с итогами, ключевые пункты видны, профессиональная подача"]
  },
  tarantino: {
    en: ["Dutch angle shot, tension building, stylized composition", "Close-up dialogue shot, intense eye contact, dramatic pause", "Quick cut montage, non-linear sequence, sharp edits", "Long take conversation, tracking shot, character focus"],
    ru: ["Голландский угол, нарастание напряжения, стилизованная композиция", "Крупный план диалога, интенсивный зрительный контакт, драматичная пауза", "Быстрый монтаж, нелинейная последовательность, резкие переходы", "Длинный дубль разговора, следящий кадр, фокус на персонаже"]
  },
  anime: {
    en: ["Dramatic zoom, speed lines, manga panel style", "Inner monologue shot, dramatic lighting, intense stare", "Action sequence, dynamic angles, anime aesthetic", "Transformation scene, glowing effects, power reveal"],
    ru: ["Драматичный зум, линии скорости, стиль манга панели", "Кадр внутреннего монолога, драматичный свет, интенсивный взгляд", "Экшн последовательность, динамичные углы, аниме эстетика", "Сцена трансформации, светящиеся эффекты, раскрытие силы"]
  },
  brainrot: {
    en: ["Chaotic quick cuts, phone camera aesthetic, random zooms", "Meme overlay style, distorted effects, internet culture", "Fast motion montage, chaotic energy, brain melting", "Random reaction insert, quick cuts, sensory overload"],
    ru: ["Хаотичные быстрые переходы, эстетика камеры телефона, случайные зумы", "Стиль мем наложения, искажённые эффекты, интернет культура", "Быстрый монтаж, хаотичная энергия, взрыв мозга", "Случайная вставка реакции, быстрые переходы, сенсорная перегрузка"]
  },
  adult: {
    en: ["Sultry lighting, intimate atmosphere, suggestive framing", "Mysterious silhouette, teasing reveal, tasteful composition", "Romantic ambiance, soft focus, sensual mood", "Playful hint, suggestive angle, sophisticated aesthetic"],
    ru: ["Чувственное освещение, интимная атмосфера, намекающая композиция", "Таинственный силуэт, дразнящее раскрытие, со вкусом", "Романтическая атмосфера, мягкий фокус, чувственное настроение", "Игривый намёк, намекающий угол, изысканная эстетика"]
  },
  howto: {
    en: ["Step demonstration shot, clear hands visible, instructional", "Tool close-up, product focus, tutorial style", "Process sequence, before during after, educational", "Result showcase, final product reveal, satisfying completion"],
    ru: ["Демонстрация шага, видны руки, инструкция", "Крупный план инструмента, фокус на продукте, туториал", "Последовательность процесса, до во время после, образовательный", "Демонстрация результата, финальный продукт, удовлетворение"]
  },
  mythbusting: {
    en: ["Myth statement graphic, dramatic presentation, contrast setup", "Evidence reveal shot, scientific demonstration, proof", "Reality check moment, truth unveiling, dramatic contrast", "Fact confirmation, before after comparison, debunk complete"],
    ru: ["Графика заявления мифа, драматичная подача, контрастный сетап", "Кадр раскрытия доказательства, научная демонстрация, доказательство", "Момент проверки реальности, раскрытие правды, драматичный контраст", "Подтверждение факта, сравнение до после, миф развенчан"]
  },
  top5: {
    en: ["Countdown graphic, number reveal, ranking style", "Item showcase, dramatic presentation, list format", "Building suspense, reveal anticipation, climactic", "Number one reveal, grand finale, best item showcase"],
    ru: ["Графика обратного отсчёта, раскрытие номера, стиль рейтинга", "Демонстрация элемента, драматичная презентация, формат списка", "Нарастание ожидания, предвкушение раскрытия, кульминационный", "Раскрытие номера один, грандиозный финал, лучший элемент"]
  },
  hottakes: {
    en: ["Bold statement graphic, confrontational framing, provocative", "Reaction shot, controversial opinion, bold delivery", "Debate style split, opposing views, tension", "Mic drop moment, confident delivery, controversial stance"],
    ru: ["Графика смелого заявления, конфронтационная композиция, провокация", "Кадр реакции, спорное мнение, смелая подача", "Разделение в стиле дебатов, противоположные взгляды, напряжение", "Момент дроп микрофона, уверенная подача, спорная позиция"]
  },
  pov: {
    en: ["First person POV, immersive angle, you-are-there", "Scenario setup, situation reveal, relatable moment", "Realization shot, dawning understanding, POV reaction", "Outcome reveal, consequence shown, immersive resolution"],
    ru: ["POV от первого лица, погружающий угол, ты там", "Сетап сценария, раскрытие ситуации, узнаваемый момент", "Кадр осознания, понимание, POV реакция", "Раскрытие исхода, показ последствий, погружающее разрешение"]
  },
  cinematic: {
    en: ["Cinematic drone shot, golden hour, epic landscape, 4K, film grain", "Slow motion close-up, dramatic lighting, shallow depth of field, cinematic color grading", "Wide establishing shot, moody atmosphere, blue hour, professional cinematography", "Epic reveal shot, dramatic clouds, cinematic composition, Hollywood style"],
    ru: ["Кинематографичный дрон, золотой час, эпичный пейзаж, 4K, плёночное зерно", "Замедленная съёмка крупным планом, драматичное освещение, малая глубина резкости", "Широкий общий план, атмосферная съёмка, синий час, профессиональная кинематография", "Эпичное раскрытие, драматичные облака, кинематографичная композиция"]
  },
  science: {
    en: ["Scientific diagram, educational overlay, explainer style", "Microscopic close-up, discovery moment, wow factor", "Experiment demonstration, cause and effect, educational", "Simplified analogy, visual metaphor, accessible science"],
    ru: ["Научная диаграмма, образовательное наложение, объяснительный стиль", "Микроскопический крупный план, момент открытия, вау эффект", "Демонстрация эксперимента, причина и следствие, образовательный", "Упрощённая аналогия, визуальная метафора, доступная наука"]
  },
  motivation: {
    en: ["Inspiring sunrise shot, new beginning, hopeful atmosphere", "Achievement moment, celebration, triumphant mood", "Journey montage, struggle to success, motivational arc", "Empowering close-up, determined expression, call to action"],
    ru: ["Вдохновляющий рассвет, новое начало, надежда", "Момент достижения, празднование, триумфальное настроение", "Монтаж пути, от борьбы к успеху, мотивационная арка", "Вдохновляющий крупный план, решительное выражение, призыв к действию"]
  },
  versus: {
    en: ["Split screen comparison, side by side, versus format", "Product A showcase, feature highlight, comparison", "Product B showcase, contrast features, versus", "Winner reveal, verdict moment, comparison conclusion"],
    ru: ["Сплит скрин сравнение, бок о бок, формат против", "Демонстрация продукта А, акцент на фичах, сравнение", "Демонстрация продукта Б, контраст фич, против", "Раскрытие победителя, момент вердикта, заключение сравнения"]
  },
  mistake: {
    en: ["Confession moment, vulnerable expression, honest delivery", "Mistake visualization, what went wrong, lesson setup", "Consequence reveal, impact shown, learning moment", "Wisdom gained shot, lesson learned, growth revealed"],
    ru: ["Момент признания, уязвимое выражение, честная подача", "Визуализация ошибки, что пошло не так, сетап урока", "Раскрытие последствий, показ влияния, момент обучения", "Кадр обретённой мудрости, урок выучен, рост показан"]
  }
};

// Fallback LLM Provider using templates with improved story arc and bilingual support
export class FallbackLLMProvider implements LLMProvider {
  async generateHook(topic: string, preset: StylePreset, duration: Duration, language: Language): Promise<string> {
    const templates = hookTemplates[preset][language];
    const hook = templates[Math.floor(Math.random() * templates.length)];
    const formattedDuration = formatDuration(duration, language);
    // Only replace duration placeholder, hooks are standalone attention-grabbers
    return hook.replace(/{duration}/g, formattedDuration);
  }

  async generateScript(topic: string, hook: string, preset: StylePreset, duration: Duration, language: Language): Promise<string> {
    const generator = scriptTemplates[preset][language];
    return generator(topic, hook, duration);
  }

  async generateStoryboard(script: string, preset: StylePreset, duration: Duration, language: Language): Promise<StoryboardScene[]> {
    const config = durationConfig[duration];
    const scenes: StoryboardScene[] = [];
    const sceneDuration = Math.floor(parseInt(duration) / config.scenes);

    const visualStyles: Record<StylePreset, Record<Language, string[]>> = {
      news: { en: ["Headline graphic", "Anchor shot", "B-roll footage", "Data visualization", "Expert quote", "Map/location", "Summary card", "Sign-off frame"], ru: ["Графика заголовка", "Кадр ведущего", "B-roll материал", "Визуализация данных", "Цитата эксперта", "Карта/локация", "Карточка итогов", "Финальная плашка"] },
      crime: { en: ["Crime scene", "Evidence close-up", "Suspect silhouette", "Investigation room", "Document reveal", "Witness shot", "Timeline graphic", "Case closed"], ru: ["Место преступления", "Улика крупно", "Силуэт подозреваемого", "Комната следствия", "Раскрытие документа", "Кадр свидетеля", "Графика таймлайна", "Дело закрыто"] },
      detective: { en: ["Clue discovery", "Evidence board", "Magnifying detail", "Suspect lineup", "Revelation moment", "Case file", "Investigation POV", "Mystery solved"], ru: ["Обнаружение улики", "Доска с уликами", "Деталь под лупой", "Ряд подозреваемых", "Момент раскрытия", "Дело", "POV расследования", "Тайна раскрыта"] },
      storytelling: { en: ["Personal moment", "Memory flashback", "Emotional peak", "Journey montage", "Reflection shot", "Transformation", "Lesson learned", "New chapter"], ru: ["Личный момент", "Воспоминание", "Эмоциональный пик", "Монтаж пути", "Кадр рефлексии", "Трансформация", "Урок выучен", "Новая глава"] },
      comedy: { en: ["Setup shot", "Reaction insert", "Punchline moment", "Awkward pause", "Exaggerated take", "Comic timing", "Callback visual", "Laugh outro"], ru: ["Сетап кадр", "Вставка реакции", "Момент панча", "Неловкая пауза", "Преувеличенный дубль", "Комический тайминг", "Визуальный коллбэк", "Смешной финал"] },
      classic: { en: ["Opening frame", "Subject introduction", "Supporting visual", "Example shot", "Comparison frame", "Summary visual", "Closing frame", "Call to action"], ru: ["Вступительный кадр", "Представление темы", "Поддерживающий визуал", "Пример", "Сравнение", "Итоговый визуал", "Финальный кадр", "Призыв к действию"] },
      tarantino: { en: ["Dutch angle", "Close-up dialogue", "Trunk shot", "Long take", "Quick cut", "Mexican standoff", "Title card", "Stylized outro"], ru: ["Голландский угол", "Крупный диалог", "Кадр из багажника", "Длинный дубль", "Быстрый переход", "Мексиканская дуэль", "Титровая карточка", "Стильный финал"] },
      anime: { en: ["Speed lines", "Inner monologue", "Power reveal", "Dramatic zoom", "Action freeze", "Transformation", "Epic clash", "To be continued"], ru: ["Линии скорости", "Внутренний монолог", "Раскрытие силы", "Драматичный зум", "Заморозка экшна", "Трансформация", "Эпичное столкновение", "Продолжение следует"] },
      brainrot: { en: ["Random zoom", "Chaos montage", "Meme insert", "Glitch effect", "Fast cut", "Distortion", "Sensory overload", "Brain melt"], ru: ["Рандомный зум", "Хаос монтаж", "Мем вставка", "Глитч эффект", "Быстрый переход", "Искажение", "Сенсорная перегрузка", "Плавка мозга"] },
      adult: { en: ["Suggestive silhouette", "Intimate lighting", "Teasing reveal", "Romantic ambiance", "Playful hint", "Mystery shot", "Tension build", "Tasteful finale"], ru: ["Намекающий силуэт", "Интимное освещение", "Дразнящее раскрытие", "Романтическая атмосфера", "Игривый намёк", "Таинственный кадр", "Нарастание напряжения", "Изысканный финал"] },
      howto: { en: ["Step overview", "Tool close-up", "Process shot", "Demonstration", "Tip insert", "Progress check", "Result reveal", "Save reminder"], ru: ["Обзор шагов", "Инструмент крупно", "Кадр процесса", "Демонстрация", "Вставка совета", "Проверка прогресса", "Раскрытие результата", "Напоминание сохранить"] },
      mythbusting: { en: ["Myth statement", "Common belief", "Evidence shot", "Reality check", "Scientific proof", "Contrast frame", "Truth reveal", "Debunked finale"], ru: ["Заявление мифа", "Распространённое мнение", "Кадр доказательства", "Проверка реальности", "Научное доказательство", "Контрастный кадр", "Раскрытие правды", "Миф развенчан"] },
      top5: { en: ["Number 5", "Number 4", "Number 3", "Number 2", "Drumroll", "Number 1", "Winner showcase", "Follow for more"], ru: ["Номер 5", "Номер 4", "Номер 3", "Номер 2", "Барабанная дробь", "Номер 1", "Демонстрация победителя", "Подписка"] },
      hottakes: { en: ["Hot take intro", "Bold statement", "Evidence shot", "Controversial take", "Reaction bait", "Defense point", "Mic drop", "Fight me outro"], ru: ["Интро горячего мнения", "Смелое заявление", "Кадр доказательства", "Спорный тейк", "Наживка для реакции", "Точка защиты", "Дроп микрофона", "Спорьте со мной"] },
      pov: { en: ["POV setup", "Scenario intro", "Situation unfolds", "Realization moment", "Consequence shot", "Decision point", "Outcome reveal", "POV conclusion"], ru: ["POV сетап", "Интро сценария", "Ситуация разворачивается", "Момент осознания", "Кадр последствий", "Точка решения", "Раскрытие исхода", "POV заключение"] },
      cinematic: { en: ["Wide establishing shot", "Slow zoom in", "Dramatic lighting", "Close-up detail", "Pan across scene", "Silhouette shot", "Time-lapse", "Final reveal"], ru: ["Широкий общий план", "Медленный наезд", "Драматичное освещение", "Крупный план детали", "Панорама сцены", "Силуэтный кадр", "Таймлапс", "Финальное раскрытие"] },
      science: { en: ["Question graphic", "Diagram shot", "Experiment visual", "Microscopic view", "Analogy image", "Data reveal", "Mind blown", "Learn more CTA"], ru: ["Графика вопроса", "Кадр диаграммы", "Визуал эксперимента", "Микроскопический вид", "Образ аналогии", "Раскрытие данных", "Взрыв мозга", "Узнай больше"] },
      motivation: { en: ["Sunrise shot", "Challenge visual", "Struggle montage", "Breakthrough moment", "Achievement shot", "Celebration", "Wisdom quote", "Take action CTA"], ru: ["Кадр рассвета", "Визуал вызова", "Монтаж борьбы", "Момент прорыва", "Кадр достижения", "Празднование", "Цитата мудрости", "Призыв к действию"] },
      versus: { en: ["VS graphic", "Option A showcase", "Option B showcase", "Feature comparison", "Pros and cons", "Test results", "Winner reveal", "Verdict frame"], ru: ["Графика VS", "Демонстрация А", "Демонстрация Б", "Сравнение фич", "Плюсы и минусы", "Результаты теста", "Раскрытие победителя", "Кадр вердикта"] },
      mistake: { en: ["Confession setup", "The mistake", "Consequence shot", "Regret moment", "Lesson visual", "What I learned", "Wisdom gained", "Don't repeat CTA"], ru: ["Сетап признания", "Ошибка", "Кадр последствий", "Момент сожаления", "Визуал урока", "Чему я научился", "Обретённая мудрость", "Не повторяй"] }
    };

    const onScreenTexts: Record<StylePreset, Record<Language, string[]>> = {
      news: { en: ["BREAKING", "THE FACTS", "DEVELOPING", "EXPERT SAYS", "IMPACT", "WHAT'S NEXT", "STAY TUNED", "FOLLOW"], ru: ["СРОЧНО", "ФАКТЫ", "РАЗВИТИЕ", "ЭКСПЕРТ", "ВЛИЯНИЕ", "ЧТО ДАЛЬШЕ", "СЛЕДИТЕ", "ПОДПИСКА"] },
      crime: { en: ["CASE FILE", "EVIDENCE", "SUSPECT", "INVESTIGATION", "CLUE", "WITNESS", "TIMELINE", "CASE CLOSED"], ru: ["ДЕЛО", "УЛИКА", "ПОДОЗРЕВАЕМЫЙ", "РАССЛЕДОВАНИЕ", "УЛИКА", "СВИДЕТЕЛЬ", "ТАЙМЛАЙН", "ДЕЛО ЗАКРЫТО"] },
      detective: { en: ["CLUE #1", "EVIDENCE", "SUSPECT", "REVELATION", "THE TRUTH", "SOLVED", "MYSTERY", "FOLLOW"], ru: ["УЛИКА #1", "ДОКАЗАТЕЛЬСТВО", "ПОДОЗРЕВАЕМЫЙ", "РАСКРЫТИЕ", "ПРАВДА", "РАСКРЫТО", "ТАЙНА", "ПОДПИСКА"] },
      storytelling: { en: ["MY STORY", "BACK THEN", "EVERYTHING CHANGED", "I REALIZED", "THE LESSON", "NOW I KNOW", "MY JOURNEY", "FOLLOW"], ru: ["МОЯ ИСТОРИЯ", "ТОГДА", "ВСЁ ИЗМЕНИЛОСЬ", "Я ПОНЯЛ", "УРОК", "ТЕПЕРЬ Я ЗНАЮ", "МОЙ ПУТЬ", "ПОДПИСКА"] },
      comedy: { en: ["WAIT FOR IT", "AND THEN", "BRUH", "NO WAY", "LITERALLY ME", "DEAD", "I CAN'T", "FOLLOW"], ru: ["ПОДОЖДИ", "И ПОТОМ", "ВАЩЕ", "ДА ЛАДНО", "БУКВАЛЬНО Я", "УМЕР", "Я НЕ МОГУ", "ПОДПИСКА"] },
      classic: { en: ["LET'S LEARN", "STEP 1", "KEY POINT", "EXAMPLE", "REMEMBER THIS", "TAKEAWAY", "SAVE THIS", "FOLLOW"], ru: ["УЧИМСЯ", "ШАГ 1", "ГЛАВНОЕ", "ПРИМЕР", "ЗАПОМНИ", "ИТОГ", "СОХРАНИ", "ПОДПИСКА"] },
      tarantino: { en: ["SCENE 1", "DIALOGUE", "CUT TO", "TENSION", "STANDOFF", "REVEAL", "THE END", "FOLLOW"], ru: ["СЦЕНА 1", "ДИАЛОГ", "ПЕРЕХОД", "НАПРЯЖЕНИЕ", "ПРОТИВОСТОЯНИЕ", "РАСКРЫТИЕ", "КОНЕЦ", "ПОДПИСКА"] },
      anime: { en: ["NANI?!", "IMPOSSIBLE", "POWER UP", "FINAL FORM", "EPIC BATTLE", "VICTORY", "TO BE CONTINUED", "FOLLOW"], ru: ["НАНИ?!", "НЕВОЗМОЖНО", "УСИЛЕНИЕ", "ФИНАЛЬНАЯ ФОРМА", "ЭПИЧНАЯ БИТВА", "ПОБЕДА", "ПРОДОЛЖЕНИЕ", "ПОДПИСКА"] },
      brainrot: { en: ["BRO WHAT", "FR FR", "NO CAP", "SKIBIDI", "OHIO", "REAL", "NGL", "FOLLOW"], ru: ["БРО ЧТО", "РЕАЛЬНО", "БЕЗ КЭПА", "СКИБИДИ", "ОГАЙО", "ФАКТ", "НГЛ", "ПОДПИСКА"] },
      adult: { en: ["AFTER DARK", "SPICY", "18+", "TEMPTING", "FORBIDDEN", "SECRETS", "PRIVATE", "FOLLOW"], ru: ["ПОСЛЕ ПОЛУНОЧИ", "ОСТРО", "18+", "СОБЛАЗН", "ЗАПРЕТНОЕ", "СЕКРЕТЫ", "ПРИВАТНО", "ПОДПИСКА"] },
      howto: { en: ["STEP 1", "STEP 2", "STEP 3", "PRO TIP", "RESULT", "EASY!", "SAVE THIS", "FOLLOW"], ru: ["ШАГ 1", "ШАГ 2", "ШАГ 3", "СОВЕТ", "РЕЗУЛЬТАТ", "ЛЕГКО!", "СОХРАНИ", "ПОДПИСКА"] },
      mythbusting: { en: ["MYTH:", "THEY SAY", "BUT ACTUALLY", "THE TRUTH", "PROOF", "DEBUNKED", "NOW YOU KNOW", "FOLLOW"], ru: ["МИФ:", "ГОВОРЯТ", "НО НА САМОМ ДЕЛЕ", "ПРАВДА", "ДОКАЗАТЕЛЬСТВО", "РАЗВЕНЧАНО", "ТЕПЕРЬ ТЫ ЗНАЕШЬ", "ПОДПИСКА"] },
      top5: { en: ["#5", "#4", "#3", "#2", "AND #1 IS...", "THE WINNER", "BEST OF THE BEST", "FOLLOW"], ru: ["#5", "#4", "#3", "#2", "И #1 ЭТО...", "ПОБЕДИТЕЛЬ", "ЛУЧШИЙ ИЗ ЛУЧШИХ", "ПОДПИСКА"] },
      hottakes: { en: ["HOT TAKE", "RED FLAG", "UNPOPULAR OPINION", "FIGHT ME", "NO CAP", "I SAID IT", "MIC DROP", "FOLLOW"], ru: ["ГОРЯЧЕЕ МНЕНИЕ", "РЕД ФЛАГ", "НЕПОПУЛЯРНОЕ МНЕНИЕ", "СПОРЬТЕ", "БЕЗ КЭПА", "Я СКАЗАЛ", "ДРОП МИКА", "ПОДПИСКА"] },
      pov: { en: ["POV:", "YOU ARE", "SUDDENLY", "WAIT WHAT", "REALIZATION", "OH NO", "THE OUTCOME", "FOLLOW"], ru: ["POV:", "ТЫ", "ВНЕЗАПНО", "ПОДОЖДИ ЧТО", "ОСОЗНАНИЕ", "О НЕТ", "ИСХОД", "ПОДПИСКА"] },
      cinematic: { en: ["THE STORY BEGINS", "DEEPER...", "REVELATION", "THE TRUTH", "EVERYTHING CHANGES", "TO BE CONTINUED", "FOLLOW FOR MORE", "THE JOURNEY AWAITS"], ru: ["ИСТОРИЯ НАЧИНАЕТСЯ", "ГЛУБЖЕ...", "ОТКРОВЕНИЕ", "ПРАВДА", "ВСЁ МЕНЯЕТСЯ", "ПРОДОЛЖЕНИЕ...", "ПОДПИСЫВАЙСЯ", "ПУТЬ ЖДЁТ"] },
      science: { en: ["DID YOU KNOW", "THE SCIENCE", "EXPERIMENT", "RESULT", "MIND BLOWN", "EXPLAINED", "NOW YOU KNOW", "FOLLOW"], ru: ["А ТЫ ЗНАЛ", "НАУКА", "ЭКСПЕРИМЕНТ", "РЕЗУЛЬТАТ", "ВЗРЫВ МОЗГА", "ОБЪЯСНЕНО", "ТЕПЕРЬ ТЫ ЗНАЕШЬ", "ПОДПИСКА"] },
      motivation: { en: ["YOU CAN", "KEEP GOING", "THE STRUGGLE", "BREAKTHROUGH", "SUCCESS", "YOU DID IT", "BELIEVE", "FOLLOW"], ru: ["ТЫ МОЖЕШЬ", "ПРОДОЛЖАЙ", "БОРЬБА", "ПРОРЫВ", "УСПЕХ", "ТЫ СДЕЛАЛ ЭТО", "ВЕРЬ", "ПОДПИСКА"] },
      versus: { en: ["VS", "OPTION A", "OPTION B", "COMPARISON", "WINNER IS", "THE VERDICT", "BEST CHOICE", "FOLLOW"], ru: ["ПРОТИВ", "ВАРИАНТ А", "ВАРИАНТ Б", "СРАВНЕНИЕ", "ПОБЕДИТЕЛЬ", "ВЕРДИКТ", "ЛУЧШИЙ ВЫБОР", "ПОДПИСКА"] },
      mistake: { en: ["MY MISTAKE", "I MESSED UP", "CONSEQUENCE", "LESSON LEARNED", "DON'T DO THIS", "NOW I KNOW", "LEARN FROM ME", "FOLLOW"], ru: ["МОЯ ОШИБКА", "Я ОБЛАЖАЛСЯ", "ПОСЛЕДСТВИЯ", "УРОК ВЫУЧЕН", "НЕ ДЕЛАЙ ТАК", "ТЕПЕРЬ Я ЗНАЮ", "УЧИСЬ НА МНЕ", "ПОДПИСКА"] }
    };

    const sfxOptions: Record<Language, { intro: string; transition: string; outro: string }> = {
      en: { intro: "Whoosh intro", transition: "Swoosh transition", outro: "Notification ding" },
      ru: { intro: "Вжух интро", transition: "Свуш переход", outro: "Динь уведомления" }
    };

    const visuals = visualStyles[preset][language];
    const visualsEn = visualStyles[preset]["en"]; // Use English visuals for keyword lookup
    const texts = onScreenTexts[preset][language];
    const sfx = sfxOptions[language];
    const aiPrompts = aiPromptTemplates[preset][language];

    for (let i = 0; i < config.scenes; i++) {
      const visual = visuals[i % visuals.length];
      const visualEn = visualsEn[i % visualsEn.length]; // English visual for lookup
      const keywordSets = stockKeywordsByVisual[visualEn] || [["stock footage", "b-roll", "visual"]];
      const selectedKeywords = keywordSets[Math.floor(Math.random() * keywordSets.length)];
      
      // Create detailed AI prompt for video generation (always in English for AI tools)
      const basePrompt = aiPrompts[i % aiPrompts.length];
      const aiPrompt = `${basePrompt}, ${visualEn.toLowerCase()}, ${sceneDuration} second clip, 4K quality, smooth motion`;
      
      const startTime = i * sceneDuration;
      const endTime = startTime + sceneDuration;
      const text = texts[i % texts.length];
      scenes.push({
        sceneId: `scene-${i + 1}`,
        sceneNumber: i + 1,
        startTime: startTime,
        endTime: endTime,
        visual: visual,
        onScreenText: text,
        voText: text,
        sfx: i === 0 ? sfx.intro : i === config.scenes - 1 ? sfx.outro : sfx.transition,
        durationHint: `${sceneDuration}s`,
        stockKeywords: selectedKeywords,
        aiPrompt: aiPrompt
      });
    }

    return scenes;
  }

  // Context-aware generation methods that use full article content
  async generateHookFromContext(context: TopicContext, preset: StylePreset, duration: Duration): Promise<string> {
    const language = context.language;
    const displayTitle = language === "ru" && context.translatedTitle 
      ? context.translatedTitle 
      : context.title;
    
    // Extract key insight from content if available
    const keyFact = context.insights?.keyFacts?.[0] || "";
    const emotionalHook = context.insights?.emotionalHooks?.[0] || "";
    
    // Build context-aware hook based on content
    const contentHooks: Record<StylePreset, Record<Language, string[]>> = {
      news: { en: ["BREAKING: This just happened and you need to know.", "UPDATE: The story developing right now.", "ALERT: Critical news you haven't heard yet."], ru: ["СРОЧНО: Это только что произошло и ты должен знать.", "ОБНОВЛЕНИЕ: История которая разворачивается прямо сейчас.", "ВНИМАНИЕ: Важные новости которых ты ещё не слышал."] },
      crime: { en: ["The case that shocked everyone. Here's what happened.", "This crime went unsolved. Until now.", "The evidence was right there."], ru: ["Дело которое шокировало всех. Вот что произошло.", "Это преступление не раскрывали. До сих пор.", "Улика была прямо там."] },
      detective: { en: ["The clues were everywhere. Let me connect them.", "Something doesn't add up here.", "Every detail matters."], ru: ["Улики были повсюду. Давай их соединим.", "Что-то здесь не сходится.", "Каждая деталь важна."] },
      storytelling: { en: ["I never thought this would happen. Here's my story.", "Let me tell you about the moment everything changed.", "This taught me something I'll never forget."], ru: ["Я никогда не думал что это случится. Вот моя история.", "Расскажу о моменте когда всё изменилось.", "Это научило меня тому что я никогда не забуду."] },
      comedy: { en: ["Okay hear me out... this is actually hilarious.", "I can't be the only one who noticed this.", "Wait until you see what happens next."], ru: ["Окей послушай... это реально смешно.", "Не может быть что только я это заметил.", "Подожди пока увидишь что будет дальше."] },
      classic: { en: ["Everything you need to know in the next few seconds.", "Let me break this down simply for you.", "The facts that matter most. Right now."], ru: ["Всё что нужно знать за следующие секунды.", "Разберу это максимально просто.", "Факты которые важны. Прямо сейчас."] },
      tarantino: { en: ["Let me set the scene. This is where it gets interesting.", "You know what's funny about this situation?", "CUT TO: The moment everything went sideways."], ru: ["Давай обрисую сцену. Тут становится интересно.", "Знаешь что смешного в этой ситуации?", "ПЕРЕХОД: Момент когда всё пошло наперекосяк."] },
      anime: { en: ["NANI?! This changes everything!", "The power level here is over 9000.", "Main character moment incoming..."], ru: ["НАНИ?! Это меняет всё!", "Уровень силы здесь за 9000.", "Момент главного героя на подходе..."] },
      brainrot: { en: ["bro WHAT even is this fr fr no cap", "okay but like... hear me out", "literally me when I saw this:"], ru: ["бро ЧТО это вообще реально без кэпа", "окей но типа... послушай", "буквально я когда увидел это:"] },
      adult: { en: ["This one's for the grown-ups. You've been warned.", "Let's talk about what nobody else will...", "After dark content coming your way."], ru: ["Это для взрослых. Ты предупреждён.", "Поговорим о том о чём другие не скажут...", "Контент после полуночи летит к тебе."] },
      howto: { en: ["Here's how to do this step by step.", "The exact process I use every time.", "Follow these steps and you can't fail."], ru: ["Вот как это сделать пошагово.", "Точный процесс который я использую каждый раз.", "Следуй этим шагам и не ошибёшься."] },
      mythbusting: { en: ["Everyone believes this. They're all wrong.", "MYTH vs FACT. The truth revealed.", "You've been lied to. Here's the proof."], ru: ["Все в это верят. И все ошибаются.", "МИФ против ФАКТА. Правда раскрыта.", "Тебя обманывали. Вот доказательство."] },
      top5: { en: ["TOP 5 - and number 1 will shock you.", "Ranking from worst to best. Stay till the end.", "The countdown you didn't know you needed."], ru: ["ТОП 5 - и номер 1 тебя шокирует.", "Рейтинг от худшего к лучшему. Досмотри до конца.", "Обратный отсчёт который тебе был нужен."] },
      hottakes: { en: ["Hot take: This is a RED FLAG.", "Unpopular opinion but I'm right.", "Nobody's ready for this conversation."], ru: ["Горячее мнение: Это РЕД ФЛАГ.", "Непопулярное мнение но я прав.", "Никто не готов к этому разговору."] },
      pov: { en: ["POV: You just found out the truth.", "POV: This is happening to you right now.", "POV: The moment of realization hits."], ru: ["POV: Ты только что узнал правду.", "POV: Это происходит с тобой прямо сейчас.", "POV: Момент осознания настигает."] },
      cinematic: { en: ["What you're about to see will change everything you thought you knew.", "This story starts where others end. Watch closely.", "Some truths hide in plain sight. Until now."], ru: ["То что ты сейчас увидишь изменит всё что ты знал.", "Эта история начинается там где другие заканчиваются. Смотри внимательно.", "Некоторые истины скрываются на виду. До сих пор."] },
      science: { en: ["Science just explained something incredible.", "Here's how this actually works - simplified.", "Let me explain this like you're 5."], ru: ["Наука только что объяснила нечто невероятное.", "Вот как это работает на самом деле - просто.", "Объясню это как будто тебе 5 лет."] },
      motivation: { en: ["This is your sign to keep going.", "The mindset shift that changed everything for me.", "Stop scrolling. You need to hear this."], ru: ["Это твой знак продолжать.", "Смена мышления которая изменила для меня всё.", "Перестань листать. Тебе нужно это услышать."] },
      versus: { en: ["A vs B - which one actually wins?", "The comparison everyone's been waiting for.", "Let's settle this debate once and for all."], ru: ["A против B - кто реально побеждает?", "Сравнение которого все ждали.", "Давай закроем этот спор раз и навсегда."] },
      mistake: { en: ["I made this mistake so you don't have to.", "The one thing I wish I knew before.", "Learn from my failure. Here's what went wrong."], ru: ["Я совершил эту ошибку чтобы тебе не пришлось.", "Одна вещь которую я хотел бы знать раньше.", "Учись на моей неудаче. Вот что пошло не так."] }
    };

    const hooks = contentHooks[preset][language];
    const baseHook = emotionalHook || hooks[Math.floor(Math.random() * hooks.length)];
    
    return baseHook;
  }

  async generateScriptFromContext(context: TopicContext, hook: string, preset: StylePreset, duration: Duration): Promise<string> {
    const language = context.language;
    const displayTitle = language === "ru" && context.translatedTitle 
      ? context.translatedTitle 
      : context.title;
    
    // Use full content or summary for rich context
    const summary = context.insights?.summary || context.rawText || displayTitle;
    const keyFacts = context.insights?.keyFacts || [];
    const trendingAngles = context.insights?.trendingAngles || [];
    const seconds = parseInt(duration);
    
    // Build story-driven script based on the voiceover template format
    const buildScript = (lang: Language): string => {
      if (lang === "ru") {
        if (seconds === 30) {
          return `[Начало видеоряда]
*Голос:
— История которая требует внимания.

[Вставка] — ключевой момент

*Голос:
— ${keyFacts[0] || summary.slice(0, 100)}...

[Вставка] — визуальный акцент

*Голос:
— ${trendingAngles[0] || "Это меняет всё что ты знал."}

[Финал]
*Голос:
— Подписывайся чтобы не пропустить продолжение.`;
        } else if (seconds === 45) {
          return `[Начало видеоряда]
*Голос:
— Важная история разворачивается.
— Вот что нужно знать.

[Вставка] — контекст истории

*Голос:
— ${summary.slice(0, 150)}

[Вставка] — важный факт

*Голос:
— ${keyFacts[0] || "Вот что нужно понять:"}

[Вставка] — эскалация

*Голос:
— ${keyFacts[1] || trendingAngles[0] || "И это только начало."}

[Финал]
*Голос:
— ${trendingAngles[1] || "Теперь ты знаешь правду."}
— Подписывайся. Впереди ещё больше.`;
        } else {
          return `[Начало видеоряда]
*Голос:
— Полный разбор важной истории.
— Погружаемся.

[Вставка] — мир истории

*Голос:
— ${summary.slice(0, 200)}

[Вставка] — контекст

*Голос:
— ${keyFacts[0] || "Первое что важно понять:"}

[Вставка] — развитие

*Голос:
— ${keyFacts[1] || "Дальше — интереснее."}

[Вставка] — напряжение нарастает

*Голос:
— ${keyFacts[2] || trendingAngles[0] || "И тут начинается самое главное."}

[Вставка] — кульминация

*Голос:
— ${trendingAngles[1] || "Это переворачивает всё."}

[Финал]
*Голос:
— ${keyFacts[3] || "Теперь картина полная."}
— Подписывайся. Это только начало большой истории.`;
        }
      } else {
        if (seconds === 30) {
          return `[Video Start]
*Voice:
— A story that demands attention.

[Insert] — key moment

*Voice:
— ${keyFacts[0] || summary.slice(0, 100)}...

[Insert] — visual accent

*Voice:
— ${trendingAngles[0] || "This changes everything you thought you knew."}

[Finale]
*Voice:
— Follow for more.`;
        } else if (seconds === 45) {
          return `[Video Start]
*Voice:
— Important story developing.
— Here's what you need to know.

[Insert] — story context

*Voice:
— ${summary.slice(0, 150)}

[Insert] — key fact

*Voice:
— ${keyFacts[0] || "Here's what you need to understand:"}

[Insert] — escalation

*Voice:
— ${keyFacts[1] || trendingAngles[0] || "And this is just the beginning."}

[Finale]
*Voice:
— ${trendingAngles[1] || "Now you know the truth."}
— Follow. More is coming.`;
        } else {
          return `[Video Start]
*Voice:
— Full breakdown of an important story.
— Let's dive in.

[Insert] — story world

*Voice:
— ${summary.slice(0, 200)}

[Insert] — context

*Voice:
— ${keyFacts[0] || "First thing to understand:"}

[Insert] — development

*Voice:
— ${keyFacts[1] || "It gets more interesting."}

[Insert] — tension builds

*Voice:
— ${keyFacts[2] || trendingAngles[0] || "And here's where it gets real."}

[Insert] — climax

*Voice:
— ${trendingAngles[1] || "This changes everything."}

[Finale]
*Voice:
— ${keyFacts[3] || "Now the picture is complete."}
— Follow. This is just the beginning of a bigger story.`;
        }
      }
    };

    return buildScript(language);
  }

  async generateStoryboardFromContext(context: TopicContext, script: string, preset: StylePreset, duration: Duration): Promise<StoryboardScene[]> {
    const language = context.language;
    const config = durationConfig[duration];
    const scenes: StoryboardScene[] = [];
    const sceneDuration = Math.floor(parseInt(duration) / config.scenes);

    // Extract content-based subtitles from article
    const extractSubtitles = (): string[] => {
      const subtitles: string[] = [];
      const keyFacts = context.insights?.keyFacts || [];
      const trendingAngles = context.insights?.trendingAngles || [];
      const summary = context.insights?.summary || context.rawText || '';
      
      // Helper to extract 1-4 keywords from text
      const extractKeywords = (text: string, maxWords: number = 3): string => {
        if (!text) return '';
        // Remove common words and extract key terms
        const stopWords = language === 'ru' 
          ? ['и', 'в', 'на', 'с', 'по', 'для', 'из', 'к', 'о', 'что', 'это', 'как', 'не', 'но', 'а', 'или', 'то', 'же', 'все', 'так', 'его', 'за', 'от', 'до', 'при', 'под', 'уже', 'ещё', 'только', 'вот', 'да', 'нет', 'быть', 'был', 'была', 'были', 'будет', 'есть', 'может', 'если', 'когда', 'также', 'очень', 'который', 'которая', 'которые', 'этот', 'эта', 'эти']
          : ['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'up', 'down', 'out', 'off', 'over', 'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'and', 'but', 'if', 'or', 'because', 'until', 'while', 'this', 'that', 'these', 'those', 'it', 'its'];
        
        const words = text
          .replace(/[^a-zA-Zа-яА-ЯёЁ0-9\s]/g, ' ')
          .split(/\s+/)
          .filter(w => w.length > 2 && !stopWords.includes(w.toLowerCase()))
          .slice(0, maxWords);
        
        return words.map(w => w.toUpperCase()).join(' ');
      };

      // Beginning: intro + first fact
      if (keyFacts[0]) {
        subtitles.push(extractKeywords(keyFacts[0], 3));
      } else if (summary) {
        subtitles.push(extractKeywords(summary.slice(0, 100), 3));
      } else {
        subtitles.push(language === 'ru' ? 'НАЧАЛО' : 'START');
      }

      // Middle scenes: facts and trending angles
      const middleContent = [...keyFacts.slice(1), ...trendingAngles];
      for (let i = 0; i < config.scenes - 2; i++) {
        if (middleContent[i]) {
          subtitles.push(extractKeywords(middleContent[i], 3));
        } else if (summary && summary.length > 100 * (i + 1)) {
          subtitles.push(extractKeywords(summary.slice(100 * i, 100 * (i + 1)), 3));
        } else {
          subtitles.push(language === 'ru' ? 'ДАЛЕЕ' : 'NEXT');
        }
      }

      // End: conclusion
      const conclusion = trendingAngles[trendingAngles.length - 1] || keyFacts[keyFacts.length - 1] || '';
      if (conclusion) {
        subtitles.push(extractKeywords(conclusion, 3));
      } else {
        subtitles.push(language === 'ru' ? 'ПОДПИСКА' : 'FOLLOW');
      }

      return subtitles;
    };

    const contentSubtitles = extractSubtitles();

    const visualStyles: Record<StylePreset, Record<Language, string[]>> = {
      news: { en: ["Headline graphic", "Anchor shot", "B-roll footage", "Data visualization", "Expert quote", "Map/location", "Summary card", "Sign-off frame"], ru: ["Графика заголовка", "Кадр ведущего", "B-roll материал", "Визуализация данных", "Цитата эксперта", "Карта/локация", "Карточка итогов", "Финальная плашка"] },
      crime: { en: ["Crime scene", "Evidence close-up", "Suspect silhouette", "Investigation room", "Document reveal", "Witness shot", "Timeline graphic", "Case closed"], ru: ["Место преступления", "Улика крупно", "Силуэт подозреваемого", "Комната следствия", "Раскрытие документа", "Кадр свидетеля", "Графика таймлайна", "Дело закрыто"] },
      detective: { en: ["Clue discovery", "Evidence board", "Magnifying detail", "Suspect lineup", "Revelation moment", "Case file", "Investigation POV", "Mystery solved"], ru: ["Обнаружение улики", "Доска с уликами", "Деталь под лупой", "Ряд подозреваемых", "Момент раскрытия", "Дело", "POV расследования", "Тайна раскрыта"] },
      storytelling: { en: ["Personal moment", "Memory flashback", "Emotional peak", "Journey montage", "Reflection shot", "Transformation", "Lesson learned", "New chapter"], ru: ["Личный момент", "Воспоминание", "Эмоциональный пик", "Монтаж пути", "Кадр рефлексии", "Трансформация", "Урок выучен", "Новая глава"] },
      comedy: { en: ["Setup shot", "Reaction insert", "Punchline moment", "Awkward pause", "Exaggerated take", "Comic timing", "Callback visual", "Laugh outro"], ru: ["Сетап кадр", "Вставка реакции", "Момент панча", "Неловкая пауза", "Преувеличенный дубль", "Комический тайминг", "Визуальный коллбэк", "Смешной финал"] },
      classic: { en: ["Opening frame", "Subject introduction", "Supporting visual", "Example shot", "Comparison frame", "Summary visual", "Closing frame", "Call to action"], ru: ["Вступительный кадр", "Представление темы", "Поддерживающий визуал", "Пример", "Сравнение", "Итоговый визуал", "Финальный кадр", "Призыв к действию"] },
      tarantino: { en: ["Dutch angle", "Close-up dialogue", "Trunk shot", "Long take", "Quick cut", "Mexican standoff", "Title card", "Stylized outro"], ru: ["Голландский угол", "Крупный диалог", "Кадр из багажника", "Длинный дубль", "Быстрый переход", "Мексиканская дуэль", "Титровая карточка", "Стильный финал"] },
      anime: { en: ["Speed lines", "Inner monologue", "Power reveal", "Dramatic zoom", "Action freeze", "Transformation", "Epic clash", "To be continued"], ru: ["Линии скорости", "Внутренний монолог", "Раскрытие силы", "Драматичный зум", "Заморозка экшна", "Трансформация", "Эпичное столкновение", "Продолжение следует"] },
      brainrot: { en: ["Random zoom", "Chaos montage", "Meme insert", "Glitch effect", "Fast cut", "Distortion", "Sensory overload", "Brain melt"], ru: ["Рандомный зум", "Хаос монтаж", "Мем вставка", "Глитч эффект", "Быстрый переход", "Искажение", "Сенсорная перегрузка", "Плавка мозга"] },
      adult: { en: ["Suggestive silhouette", "Intimate lighting", "Teasing reveal", "Romantic ambiance", "Playful hint", "Mystery shot", "Tension build", "Tasteful finale"], ru: ["Намекающий силуэт", "Интимное освещение", "Дразнящее раскрытие", "Романтическая атмосфера", "Игривый намёк", "Таинственный кадр", "Нарастание напряжения", "Изысканный финал"] },
      howto: { en: ["Step overview", "Tool close-up", "Process shot", "Demonstration", "Tip insert", "Progress check", "Result reveal", "Save reminder"], ru: ["Обзор шагов", "Инструмент крупно", "Кадр процесса", "Демонстрация", "Вставка совета", "Проверка прогресса", "Раскрытие результата", "Напоминание сохранить"] },
      mythbusting: { en: ["Myth statement", "Common belief", "Evidence shot", "Reality check", "Scientific proof", "Contrast frame", "Truth reveal", "Debunked finale"], ru: ["Заявление мифа", "Распространённое мнение", "Кадр доказательства", "Проверка реальности", "Научное доказательство", "Контрастный кадр", "Раскрытие правды", "Миф развенчан"] },
      top5: { en: ["Number 5", "Number 4", "Number 3", "Number 2", "Drumroll", "Number 1", "Winner showcase", "Follow for more"], ru: ["Номер 5", "Номер 4", "Номер 3", "Номер 2", "Барабанная дробь", "Номер 1", "Демонстрация победителя", "Подписка"] },
      hottakes: { en: ["Hot take intro", "Bold statement", "Evidence shot", "Controversial take", "Reaction bait", "Defense point", "Mic drop", "Fight me outro"], ru: ["Интро горячего мнения", "Смелое заявление", "Кадр доказательства", "Спорный тейк", "Наживка для реакции", "Точка защиты", "Дроп микрофона", "Спорьте со мной"] },
      pov: { en: ["POV setup", "Scenario intro", "Situation unfolds", "Realization moment", "Consequence shot", "Decision point", "Outcome reveal", "POV conclusion"], ru: ["POV сетап", "Интро сценария", "Ситуация разворачивается", "Момент осознания", "Кадр последствий", "Точка решения", "Раскрытие исхода", "POV заключение"] },
      cinematic: { en: ["Wide establishing shot", "Slow zoom in", "Dramatic lighting", "Close-up detail", "Pan across scene", "Silhouette shot", "Time-lapse", "Final reveal"], ru: ["Широкий общий план", "Медленный наезд", "Драматичное освещение", "Крупный план детали", "Панорама сцены", "Силуэтный кадр", "Таймлапс", "Финальное раскрытие"] },
      science: { en: ["Question graphic", "Diagram shot", "Experiment visual", "Microscopic view", "Analogy image", "Data reveal", "Mind blown", "Learn more CTA"], ru: ["Графика вопроса", "Кадр диаграммы", "Визуал эксперимента", "Микроскопический вид", "Образ аналогии", "Раскрытие данных", "Взрыв мозга", "Узнай больше"] },
      motivation: { en: ["Sunrise shot", "Challenge visual", "Struggle montage", "Breakthrough moment", "Achievement shot", "Celebration", "Wisdom quote", "Take action CTA"], ru: ["Кадр рассвета", "Визуал вызова", "Монтаж борьбы", "Момент прорыва", "Кадр достижения", "Празднование", "Цитата мудрости", "Призыв к действию"] },
      versus: { en: ["VS graphic", "Option A showcase", "Option B showcase", "Feature comparison", "Pros and cons", "Test results", "Winner reveal", "Verdict frame"], ru: ["Графика VS", "Демонстрация А", "Демонстрация Б", "Сравнение фич", "Плюсы и минусы", "Результаты теста", "Раскрытие победителя", "Кадр вердикта"] },
      mistake: { en: ["Confession setup", "The mistake", "Consequence shot", "Regret moment", "Lesson visual", "What I learned", "Wisdom gained", "Don't repeat CTA"], ru: ["Сетап признания", "Ошибка", "Кадр последствий", "Момент сожаления", "Визуал урока", "Чему я научился", "Обретённая мудрость", "Не повторяй"] }
    };

    const sfxOptions: Record<Language, { intro: string; transition: string; outro: string }> = {
      en: { intro: "Whoosh intro", transition: "Swoosh transition", outro: "Notification ding" },
      ru: { intro: "Вжух интро", transition: "Свуш переход", outro: "Динь уведомления" }
    };

    const visuals = visualStyles[preset][language];
    const visualsEn = visualStyles[preset]["en"];
    const sfx = sfxOptions[language];
    const aiPrompts = aiPromptTemplates[preset][language];

    for (let i = 0; i < config.scenes; i++) {
      const visual = visuals[i % visuals.length];
      const visualEn = visualsEn[i % visualsEn.length];
      const keywordSets = stockKeywordsByVisual[visualEn] || [["stock footage", "b-roll", "visual"]];
      const selectedKeywords = keywordSets[Math.floor(Math.random() * keywordSets.length)];
      
      const basePrompt = aiPrompts[i % aiPrompts.length];
      const aiPrompt = `${basePrompt}, ${visualEn.toLowerCase()}, ${sceneDuration} second clip, 4K quality, smooth motion`;
      
      const startTime = i * sceneDuration;
      const endTime = startTime + sceneDuration;
      const text = contentSubtitles[i] || (language === 'ru' ? 'ПОДПИСКА' : 'FOLLOW');
      scenes.push({
        sceneId: `scene-${i + 1}`,
        sceneNumber: i + 1,
        startTime: startTime,
        endTime: endTime,
        visual: visual,
        onScreenText: text,
        voText: text,
        sfx: i === 0 ? sfx.intro : i === config.scenes - 1 ? sfx.outro : sfx.transition,
        durationHint: `${sceneDuration}s`,
        stockKeywords: selectedKeywords,
        aiPrompt: aiPrompt
      });
    }

    return scenes;
  }

  async generateHeadline(rawTitle: string, sourceName: string, language: Language): Promise<string> {
    // Generate a concise, meaningful headline from raw title/source info
    // In production, this would use AI; for fallback, we use smart patterns
    
    // Check if title is a placeholder/auto-generated pattern
    const placeholderPatterns = [
      /Topic from .+: Trending content/i,
      /Trending content #\d+/i,
      /Content #\d+/i,
      /^#\d+$/,
      /^Topic from .+$/i,
      /^Item \d+$/i,
      /^Entry \d+$/i,
      /Новости.+#\d+/i,
      /^News item/i,
      /^Untitled/i,
    ];
    
    const trimmedTitle = rawTitle.trim();
    const isPlaceholder = placeholderPatterns.some(p => p.test(trimmedTitle));
    
    // Also check for overly short or generic titles
    const isGeneric = trimmedTitle.length < 15 || 
                      /^[A-Za-z0-9\s]+$/.test(trimmedTitle) && trimmedTitle.split(' ').length < 3;
    
    if (!isPlaceholder && !isGeneric && trimmedTitle.length > 10 && trimmedTitle.length < 200) {
      // Title already looks meaningful, return as-is
      return rawTitle;
    }
    
    // Generate synthetic headlines based on source category
    const headlineTemplates: Record<string, Record<Language, string[]>> = {
      tech: {
        en: [
          "New tech breakthrough changes the industry",
          "Major tech company announces game-changing update",
          "Revolutionary device hits the market",
          "Tech innovation surprises experts worldwide",
        ],
        ru: [
          "Новый технологический прорыв меняет индустрию",
          "Крупная компания анонсирует важное обновление",
          "Революционное устройство выходит на рынок",
          "Технологическая инновация удивила экспертов",
        ]
      },
      gaming: {
        en: [
          "Blockbuster game announcement shocks fans",
          "Gaming industry milestone achieved",
          "New gaming platform revealed",
          "Popular franchise gets major update",
        ],
        ru: [
          "Анонс блокбастера шокировал фанатов",
          "Игровая индустрия достигла нового рубежа",
          "Представлена новая игровая платформа",
          "Популярная франшиза получает крупное обновление",
        ]
      },
      news: {
        en: [
          "Breaking developments emerge today",
          "Major story unfolds worldwide",
          "Key announcement impacts millions",
          "Important update on developing situation",
        ],
        ru: [
          "Важные события разворачиваются сегодня",
          "Крупная история охватывает весь мир",
          "Ключевое объявление затрагивает миллионы",
          "Важное обновление о развивающейся ситуации",
        ]
      },
      business: {
        en: [
          "Major deal reshapes market landscape",
          "Business leaders announce strategic move",
          "Economic shift impacts global trade",
          "Corporate announcement moves markets",
        ],
        ru: [
          "Крупная сделка меняет рынок",
          "Бизнес-лидеры объявляют о стратегическом шаге",
          "Экономический сдвиг влияет на мировую торговлю",
          "Корпоративное объявление движет рынками",
        ]
      },
      default: {
        en: [
          "Important story you need to see",
          "What everyone is talking about today",
          "The story that's breaking the internet",
          "Don't miss this trending topic",
        ],
        ru: [
          "Важная история которую стоит увидеть",
          "О чём все говорят сегодня",
          "История которая взрывает интернет",
          "Не пропусти этот тренд",
        ]
      }
    };
    
    // Detect category from source name with expanded keywords
    const sourceLower = sourceName.toLowerCase();
    let category = "default";
    
    // Tech sources
    const techKeywords = ["tech", "verge", "ars", "wired", "engadget", "techcrunch", "gizmodo", 
                          "cnet", "zdnet", "apple", "google", "microsoft", "ai", "gadget", 
                          "технолог", "хабр", "geek"];
    // Gaming sources  
    const gamingKeywords = ["ign", "game", "kotaku", "polygon", "gamespot", "pcgamer", "eurogamer",
                            "rockpapershotgun", "steam", "playstation", "xbox", "nintendo", "esport",
                            "игр", "gaming", "gamer"];
    // News sources
    const newsKeywords = ["bbc", "cnn", "reuters", "ap news", "guardian", "nytimes", "washingtonpost",
                          "новости", "news", "lenta", "ria", "tass", "rbc", "interfax", "meduza"];
    // Business sources
    const businessKeywords = ["forbes", "business", "bloomberg", "economist", "wsj", "financial times",
                              "fortune", "inc", "entrepreneur", "бизнес", "коммерсант", "ведомости"];
    
    if (techKeywords.some(k => sourceLower.includes(k))) {
      category = "tech";
    } else if (gamingKeywords.some(k => sourceLower.includes(k))) {
      category = "gaming";
    } else if (newsKeywords.some(k => sourceLower.includes(k))) {
      category = "news";
    } else if (businessKeywords.some(k => sourceLower.includes(k))) {
      category = "business";
    }
    
    const templates = headlineTemplates[category][language];
    return templates[Math.floor(Math.random() * templates.length)];
  }

  async translateTitle(title: string, targetLanguage: Language): Promise<string> {
    // Simple translation patterns for common English->Russian news terms
    // In production, this would use a real translation API
    if (targetLanguage === "ru") {
      const translationPatterns: Record<string, string> = {
        "breaking": "срочно",
        "update": "обновление",
        "news": "новости",
        "report": "репортаж",
        "analysis": "анализ",
        "exclusive": "эксклюзив",
        "revealed": "раскрыто",
        "discovered": "обнаружено",
        "announces": "объявляет",
        "launches": "запускает",
        "warning": "предупреждение",
        "crisis": "кризис",
        "world": "мир",
        "global": "глобальный",
        "local": "местный",
        "technology": "технологии",
        "science": "наука",
        "health": "здоровье",
        "economy": "экономика",
        "politics": "политика",
        "entertainment": "развлечения",
        "sports": "спорт",
        "culture": "культура",
      };
      
      let translated = title.toLowerCase();
      for (const [en, ru] of Object.entries(translationPatterns)) {
        translated = translated.replace(new RegExp(`\\b${en}\\b`, "gi"), ru);
      }
      
      // Capitalize first letter
      return translated.charAt(0).toUpperCase() + translated.slice(1);
    }
    
    return title;
  }

  async extractInsights(content: string, language: Language): Promise<TopicInsights> {
    // Extract key information from content using patterns
    // In production, this would use AI/NLP
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 20);
    const words = content.toLowerCase().split(/\s+/);
    
    // Find key facts (longest sentences with important terms)
    const keyFacts = sentences
      .slice(0, 5)
      .map(s => s.trim())
      .filter(s => s.length > 30);

    // Generate trending angles based on content
    const trendingAngles: string[] = [];
    if (language === "ru") {
      if (content.includes("новый") || content.includes("первый")) {
        trendingAngles.push("Это меняет правила игры");
      }
      if (content.includes("эксперт") || content.includes("исследовани")) {
        trendingAngles.push("Учёные подтвердили");
      }
      if (content.includes("внимани") || content.includes("важно")) {
        trendingAngles.push("Это касается каждого");
      }
    } else {
      if (content.includes("new") || content.includes("first")) {
        trendingAngles.push("This is a game changer");
      }
      if (content.includes("expert") || content.includes("research")) {
        trendingAngles.push("Scientists confirm");
      }
      if (content.includes("attention") || content.includes("important")) {
        trendingAngles.push("This affects everyone");
      }
    }

    // Generate emotional hooks
    const emotionalHooks: string[] = [];
    if (language === "ru") {
      emotionalHooks.push("Ты не поверишь что произошло дальше");
      emotionalHooks.push("Вот почему все об этом говорят");
    } else {
      emotionalHooks.push("You won't believe what happened next");
      emotionalHooks.push("This is why everyone is talking about it");
    }

    // Create summary (first 2-3 sentences)
    const summary = sentences.slice(0, 3).join(". ").trim();

    // Calculate viral potential (0-100)
    const viralIndicators = ["viral", "trending", "breaking", "exclusive", "shocking", "срочно", "вирусный", "тренд"];
    const viralScore = Math.min(100, 50 + viralIndicators.filter(v => content.toLowerCase().includes(v)).length * 15);

    return {
      keyFacts,
      trendingAngles,
      emotionalHooks,
      targetAudience: "general",
      viralPotential: viralScore,
      summary,
    };
  }

  async generateThesesFromContent(content: string, language: Language, count: number = 3): Promise<string[]> {
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 20);
    const theses: string[] = [];
    
    for (let i = 0; i < Math.min(count, sentences.length); i++) {
      const sentence = sentences[i].trim();
      if (sentence.length > 10 && sentence.length < 100) {
        theses.push(sentence);
      }
    }
    
    if (theses.length < count) {
      const defaults = language === "ru" 
        ? ["Важный факт из статьи", "Ключевое открытие", "Интересная деталь"]
        : ["Important fact from the article", "Key discovery", "Interesting detail"];
      while (theses.length < count) {
        theses.push(defaults[theses.length % defaults.length]);
      }
    }
    
    return theses;
  }

  async generateThesesFromWeb(topic: string, language: Language, count: number = 3): Promise<string[]> {
    const templates = language === "ru" 
      ? [
          "Это тренд, который меняет всё",
          "Эксперты удивлены результатами",
          "Миллионы людей уже попробовали",
          "Научно доказанный факт",
          "Секрет успешных людей"
        ]
      : [
          "This trend is changing everything",
          "Experts are surprised by the results",
          "Millions of people have already tried this",
          "Scientifically proven fact",
          "The secret of successful people"
        ];
    
    const shuffled = templates.sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }

  async generateSEO(params: SEOGenerationParams): Promise<SeoOutputs> {
    const { topic, keywords, language } = params;
    const topicClean = topic.slice(0, 50);
    
    const seoTitleOptions = language === "ru"
      ? [
          `${topicClean} - то, что нужно знать`,
          `${topicClean}: полный разбор`,
          `Вся правда о ${topicClean.toLowerCase()}`
        ]
      : [
          `${topicClean} - What You Need to Know`,
          `${topicClean}: Complete Breakdown`,
          `The Truth About ${topicClean}`
        ];
    
    const baseHashtags = keywords.length > 0 
      ? keywords.slice(0, 8).map(k => `#${k.replace(/\s+/g, "")}`)
      : [`#${topic.replace(/\s+/g, "").slice(0, 20)}`];
    
    const popularHashtags = language === "ru"
      ? ["#shorts", "#тренды", "#рекомендации", "#viral", "#fyp"]
      : ["#shorts", "#trending", "#viral", "#fyp", "#foryou"];
    
    const hashtags = [...baseHashtags, ...popularHashtags.slice(0, 10 - baseHashtags.length)].slice(0, 10);
    
    return {
      seoTitleOptions,
      seoTitle: seoTitleOptions[0],
      hashtags
    };
  }

  async generateRaw(systemPrompt: string, userPrompt: string, maxTokens: number = 1000): Promise<string> {
    // Fallback returns a template message indicating no LLM is configured
    return JSON.stringify({
      message: "No LLM API configured. Configure an API key in Settings to enable AI generation.",
      fallback: true
    });
  }
}

// Fallback TTS Provider (no audio, just text file)
export class FallbackTTSProvider implements TTSProvider {
  async generateVoice(text: string, preset: StylePreset): Promise<string | null> {
    return null;
  }
}

// Fallback Music Provider with free track suggestions
export class FallbackMusicProvider implements MusicProvider {
  async pickMusic(script: string, preset: StylePreset, duration: Duration): Promise<MusicConfig> {
    const musicStyles: Record<StylePreset, MusicConfig> = {
      news: { mood: "Serious, Trustworthy", bpm: 85, genre: "News / Corporate", references: ["News broadcast music", "Documentary underscore", "Tension build"], licenseNote: "Use royalty-free news/documentary tracks from Bensound", freeTrackSuggestions: freeMusicDatabase["Serious, Trustworthy"] },
      crime: { mood: "Epic, Emotional", bpm: 75, genre: "Thriller / Suspense", references: ["Dark mystery", "Tension build", "Noir soundtrack"], licenseNote: "Use royalty-free thriller tracks from Bensound", freeTrackSuggestions: freeMusicDatabase["Epic, Emotional"] },
      detective: { mood: "Epic, Emotional", bpm: 80, genre: "Mystery / Investigation", references: ["Detective noir", "Clue reveal", "Suspenseful piano"], licenseNote: "Use royalty-free mystery tracks from Bensound", freeTrackSuggestions: freeMusicDatabase["Epic, Emotional"] },
      storytelling: { mood: "Epic, Emotional", bpm: 85, genre: "Emotional / Cinematic", references: ["Personal journey", "Emotional strings", "Nostalgic piano"], licenseNote: "Use royalty-free emotional tracks from Bensound", freeTrackSuggestions: freeMusicDatabase["Epic, Emotional"] },
      comedy: { mood: "Quirky, Playful", bpm: 120, genre: "Comedy / Playful", references: ["Comedic timing", "Funny sound", "Upbeat quirky"], licenseNote: "Use royalty-free comedy tracks from Bensound", freeTrackSuggestions: freeMusicDatabase["Quirky, Playful"] },
      classic: { mood: "Balanced, Neutral", bpm: 100, genre: "Acoustic / Soft Rock", references: ["Uplifting acoustic", "Gentle indie", "Positive vibes"], licenseNote: "Use royalty-free tracks from Bensound, Artlist or Epidemic Sound", freeTrackSuggestions: freeMusicDatabase["Balanced, Neutral"] },
      tarantino: { mood: "Epic, Emotional", bpm: 100, genre: "Retro / Surf Rock", references: ["70s soundtrack", "Tarantino style", "Surf guitar"], licenseNote: "Use royalty-free retro tracks from Bensound", freeTrackSuggestions: freeMusicDatabase["Epic, Emotional"] },
      anime: { mood: "Energetic, Upbeat", bpm: 140, genre: "J-Pop / Electronic", references: ["Anime opening", "Epic battle", "Dramatic reveal"], licenseNote: "Use royalty-free anime-style tracks from Bensound", freeTrackSuggestions: freeMusicDatabase["Energetic, Upbeat"] },
      brainrot: { mood: "Quirky, Playful", bpm: 150, genre: "Meme / Chaotic", references: ["TikTok chaos", "Distorted bass", "Meme sounds"], licenseNote: "Use trending sounds or royalty-free quirky tracks", freeTrackSuggestions: freeMusicDatabase["Quirky, Playful"] },
      adult: { mood: "Professional, Clean", bpm: 90, genre: "Chill / R&B", references: ["Sultry beats", "Smooth R&B", "Late night vibes"], licenseNote: "Use royalty-free chill tracks from Bensound", freeTrackSuggestions: freeMusicDatabase["Professional, Clean"] },
      howto: { mood: "Balanced, Neutral", bpm: 110, genre: "Tutorial / Uplifting", references: ["Educational background", "Positive energy", "Clear focus"], licenseNote: "Use royalty-free tutorial tracks from Bensound", freeTrackSuggestions: freeMusicDatabase["Balanced, Neutral"] },
      mythbusting: { mood: "Serious, Trustworthy", bpm: 95, genre: "Documentary / Reveal", references: ["Fact reveal", "Scientific discovery", "Tension release"], licenseNote: "Use royalty-free documentary tracks from Bensound", freeTrackSuggestions: freeMusicDatabase["Serious, Trustworthy"] },
      top5: { mood: "Energetic, Upbeat", bpm: 115, genre: "Countdown / Hype", references: ["Countdown build", "Ranking suspense", "Winner reveal"], licenseNote: "Use royalty-free upbeat tracks from Bensound", freeTrackSuggestions: freeMusicDatabase["Energetic, Upbeat"] },
      hottakes: { mood: "Energetic, Upbeat", bpm: 125, genre: "Bold / Provocative", references: ["Controversial vibes", "Bold statement", "Debate energy"], licenseNote: "Use royalty-free bold tracks from Bensound", freeTrackSuggestions: freeMusicDatabase["Energetic, Upbeat"] },
      pov: { mood: "Epic, Emotional", bpm: 95, genre: "Immersive / Atmospheric", references: ["First person vibe", "Scenario build", "Realization moment"], licenseNote: "Use royalty-free atmospheric tracks from Bensound", freeTrackSuggestions: freeMusicDatabase["Epic, Emotional"] },
      cinematic: { mood: "Epic, Emotional", bpm: 90, genre: "Orchestral / Cinematic", references: ["Hans Zimmer style", "Trailer music", "Epic strings"], licenseNote: "Use royalty-free cinematic tracks from Bensound, Epidemic Sound or Artlist", freeTrackSuggestions: freeMusicDatabase["Epic, Emotional"] },
      science: { mood: "Professional, Clean", bpm: 100, genre: "Educational / Wonder", references: ["Discovery moment", "Scientific wonder", "Explainer vibe"], licenseNote: "Use royalty-free educational tracks from Bensound", freeTrackSuggestions: freeMusicDatabase["Professional, Clean"] },
      motivation: { mood: "Energetic, Upbeat", bpm: 120, genre: "Inspirational / Uplifting", references: ["Motivational speech", "Rise up", "Victory moment"], licenseNote: "Use royalty-free inspirational tracks from Bensound", freeTrackSuggestions: freeMusicDatabase["Energetic, Upbeat"] },
      versus: { mood: "Energetic, Upbeat", bpm: 110, genre: "Comparison / Competitive", references: ["Battle music", "Competition vibe", "Showdown"], licenseNote: "Use royalty-free competitive tracks from Bensound", freeTrackSuggestions: freeMusicDatabase["Energetic, Upbeat"] },
      mistake: { mood: "Epic, Emotional", bpm: 80, genre: "Reflective / Lesson", references: ["Confession vibe", "Learning moment", "Growth journey"], licenseNote: "Use royalty-free reflective tracks from Bensound", freeTrackSuggestions: freeMusicDatabase["Epic, Emotional"] }
    };

    return musicStyles[preset];
  }
}

// Unified provider factory - uses Replit AI Integrations (OpenAI)
export async function createLLMProvider(): Promise<LLMProvider> {
  try {
    // Check if OpenAI API is available via Replit AI Integrations
    const hasOpenAI = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    
    if (hasOpenAI) {
      console.log("[Providers] Using unified OpenAI provider via Replit AI Integrations");
      return new UnifiedLLMProvider();
    }
    
    // Check if fallback mode is explicitly enabled
    const settings = await storage.getSettings();
    const settingsMap = new Map(settings.map(s => [s.key, s.value]));
    const fallbackMode = settingsMap.get("fallbackMode") === "true";
    
    if (fallbackMode) {
      console.log("[Providers] Fallback mode enabled, using template provider");
      return new FallbackLLMProvider();
    }
    
    console.log("[Providers] No OpenAI API configured, using fallback template provider");
    return new FallbackLLMProvider();
  } catch (error) {
    console.error("[Providers] Error creating LLM provider:", error);
    return new FallbackLLMProvider();
  }
}

// Provider factory - creates static instances but LLM can be refreshed
let currentLLMProvider: LLMProvider = new FallbackLLMProvider();
let providerInitialized = false;

export async function refreshLLMProvider(): Promise<void> {
  currentLLMProvider = await createLLMProvider();
  providerInitialized = true;
}

export async function ensureProviderInitialized(): Promise<void> {
  if (!providerInitialized) {
    await refreshLLMProvider();
  }
}

export const providers = {
  get llm(): LLMProvider {
    return currentLLMProvider;
  },
  tts: new FallbackTTSProvider(),
  music: new FallbackMusicProvider()
};
