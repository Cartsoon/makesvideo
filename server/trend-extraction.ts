import { storage } from "./storage";
import { extractKeywords, normalizeText } from "./text-utils";
import type { CategoryId, InsertTrendSignal, TrendSignal, TrendPlatform } from "@shared/schema";

interface YouTubeShortPattern {
  hookType: string;
  angle: string;
  pacing: "fast" | "medium" | "slow";
  duration: string;
  keywords: string[];
}

const VIRAL_HOOK_PATTERNS = [
  { pattern: "никто не знает", type: "mystery", weight: 0.9 },
  { pattern: "вы не поверите", type: "disbelief", weight: 0.85 },
  { pattern: "топ 5", type: "listicle", weight: 0.8 },
  { pattern: "почему", type: "curiosity", weight: 0.75 },
  { pattern: "как на самом деле", type: "revelation", weight: 0.85 },
  { pattern: "что будет если", type: "experiment", weight: 0.8 },
  { pattern: "срочно", type: "urgency", weight: 0.7 },
  { pattern: "шок", type: "shock", weight: 0.65 },
  { pattern: "это изменит", type: "transformation", weight: 0.8 },
  { pattern: "секрет", type: "secret", weight: 0.75 },
  { pattern: "nobody knows", type: "mystery", weight: 0.9 },
  { pattern: "you won't believe", type: "disbelief", weight: 0.85 },
  { pattern: "top 5", type: "listicle", weight: 0.8 },
  { pattern: "why", type: "curiosity", weight: 0.75 },
  { pattern: "the truth about", type: "revelation", weight: 0.85 },
  { pattern: "what happens when", type: "experiment", weight: 0.8 },
  { pattern: "breaking", type: "urgency", weight: 0.7 },
  { pattern: "shocking", type: "shock", weight: 0.65 },
  { pattern: "this will change", type: "transformation", weight: 0.8 },
  { pattern: "secret", type: "secret", weight: 0.75 }
];

const VIRAL_ANGLES = [
  "controversy",
  "underdog_story",
  "behind_the_scenes",
  "before_after",
  "myth_vs_reality",
  "unpopular_opinion",
  "insider_knowledge",
  "life_hack",
  "emotional_journey",
  "unexpected_twist"
];

function detectHookPatterns(title: string): string[] {
  const normalized = normalizeText(title);
  const detected: string[] = [];
  
  for (const { pattern, type } of VIRAL_HOOK_PATTERNS) {
    if (normalized.includes(pattern.toLowerCase())) {
      detected.push(type);
    }
  }
  
  return detected.length > 0 ? detected : ["standard"];
}

function detectPacing(duration: number): "fast" | "medium" | "slow" {
  if (duration <= 30) return "fast";
  if (duration <= 60) return "medium";
  return "slow";
}

function detectAngles(title: string, description: string): string[] {
  const combined = normalizeText(`${title} ${description}`);
  const angles: string[] = [];
  
  if (combined.includes("vs") || combined.includes("против") || combined.includes("сравн")) {
    angles.push("controversy");
  }
  if (combined.includes("секрет") || combined.includes("secret") || combined.includes("никто не")) {
    angles.push("insider_knowledge");
  }
  if (combined.includes("до и после") || combined.includes("before") || combined.includes("after")) {
    angles.push("before_after");
  }
  if (combined.includes("миф") || combined.includes("myth") || combined.includes("правда")) {
    angles.push("myth_vs_reality");
  }
  if (combined.includes("лайфхак") || combined.includes("hack") || combined.includes("совет")) {
    angles.push("life_hack");
  }
  
  return angles.length > 0 ? angles : ["standard"];
}

export async function extractTrendSignalFromContent(
  title: string,
  description: string,
  categoryId: CategoryId | null,
  platform: TrendPlatform = "youtube_shorts",
  duration: number = 60
): Promise<InsertTrendSignal> {
  const hookPatterns = detectHookPatterns(title);
  const angles = detectAngles(title, description);
  const pacing = detectPacing(duration);
  const keywords = extractKeywords(`${title} ${description}`, 8);
  
  let score = 50;
  
  for (const pattern of hookPatterns) {
    const found = VIRAL_HOOK_PATTERNS.find(p => p.type === pattern);
    if (found) {
      score += found.weight * 20;
    }
  }
  
  score = Math.min(100, Math.round(score));
  
  return {
    platform,
    categoryId: categoryId || undefined,
    keywords,
    angles,
    hookPatterns,
    pacingHints: pacing,
    durationModes: [duration.toString()],
    score
  };
}

export async function extractTrendsFromTopics(categoryId?: CategoryId): Promise<TrendSignal[]> {
  const topics = await storage.getTopics();
  const sources = await storage.getSources();
  const sourceMap = new Map(sources.map(s => [s.id, s]));
  
  const relevantTopics = categoryId 
    ? topics.filter(t => {
        const source = sourceMap.get(t.sourceId);
        return source?.categoryId === categoryId;
      })
    : topics;
  
  const highScoreTopics = relevantTopics
    .filter(t => t.score >= 70)
    .slice(0, 10);
  
  const extractedSignals: TrendSignal[] = [];
  
  for (const topic of highScoreTopics) {
    const signalData = await extractTrendSignalFromContent(
      topic.title,
      topic.rawText || '',
      categoryId || null,
      "general",
      60
    );
    
    const signal = await storage.createTrendSignal(signalData);
    extractedSignals.push(signal);
  }
  
  console.log(`[TrendExtraction] Extracted ${extractedSignals.length} trend signals from topics`);
  return extractedSignals;
}

export async function getTrendSignalsForGeneration(
  categoryId?: CategoryId,
  platform: TrendPlatform = "youtube_shorts"
): Promise<TrendSignal[]> {
  const allSignals = await storage.getTrendSignals();
  
  return allSignals
    .filter(s => {
      if (platform && s.platform !== platform && s.platform !== "general") return false;
      if (categoryId && s.categoryId && s.categoryId !== categoryId) return false;
      return true;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

export function buildTrendEnhancedPrompt(
  basePrompt: string,
  signals: TrendSignal[]
): string {
  if (signals.length === 0) return basePrompt;
  
  const hookPatterns = Array.from(new Set(signals.flatMap(s => s.hookPatterns))).slice(0, 3);
  const angles = Array.from(new Set(signals.flatMap(s => s.angles))).slice(0, 3);
  const pacingHint = signals[0]?.pacingHints || "medium";
  
  const trendContext = `
TREND INSIGHTS (based on viral content analysis):
- Effective hook patterns: ${hookPatterns.join(', ')}
- Trending angles: ${angles.join(', ')}
- Recommended pacing: ${pacingHint}

Apply these patterns naturally to maximize engagement.
`;
  
  return basePrompt + '\n' + trendContext;
}

export async function analyzeContentForTrends(content: string): Promise<{
  viralScore: number;
  hookType: string;
  suggestedAngles: string[];
  pacingRecommendation: string;
}> {
  const hookPatterns = detectHookPatterns(content);
  const angles = detectAngles(content, '');
  
  let viralScore = 40;
  for (const pattern of hookPatterns) {
    const found = VIRAL_HOOK_PATTERNS.find(p => p.type === pattern);
    if (found) {
      viralScore += found.weight * 15;
    }
  }
  
  viralScore = Math.min(100, Math.round(viralScore));
  
  return {
    viralScore,
    hookType: hookPatterns[0] || "standard",
    suggestedAngles: angles,
    pacingRecommendation: viralScore > 70 ? "fast" : "medium"
  };
}
